import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  Tenant, SubscriptionStatus, SubscriptionPlan,
} from '../tenants/tenant.entity';

const PLAN_PRICE_MAP: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.BASIC]: 'STRIPE_PRICE_ID_BASIC',
  [SubscriptionPlan.PRO]: 'STRIPE_PRICE_ID_PRO',
  [SubscriptionPlan.ENTERPRISE]: 'STRIPE_PRICE_ID_ENTERPRISE',
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly configService: ConfigService,
  ) {
    const key = configService.get<string>('STRIPE_SECRET_KEY');
    if (key) {
      this.stripe = new Stripe(key, { apiVersion: '2024-04-10' });
    }
  }

  /**
   * Create Stripe Checkout Session for subscription.
   * Returns URL to redirect user to Stripe hosted checkout.
   */
  async createCheckoutSession(
    tenant: Tenant,
    plan: SubscriptionPlan,
  ): Promise<{ url: string }> {
    if (!this.stripe) throw new BadRequestException('Billing not configured');

    const priceId = this.configService.get<string>(PLAN_PRICE_MAP[plan]);
    if (!priceId) throw new BadRequestException(`No price configured for plan: ${plan}`);

    // Ensure Stripe customer exists
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: tenant.email,
        name: tenant.businessName,
        metadata: { tenantId: tenant.id },
      });
      customerId = customer.id;
      await this.tenantRepo.update(tenant.id, { stripeCustomerId: customerId });
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${frontendUrl}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/dashboard/billing?canceled=true`,
      metadata: { tenantId: tenant.id, plan },
      subscription_data: {
        metadata: { tenantId: tenant.id },
      },
    });

    return { url: session.url! };
  }

  /**
   * Create Stripe Customer Portal session for managing subscription.
   */
  async createPortalSession(tenant: Tenant): Promise<{ url: string }> {
    if (!this.stripe) throw new BadRequestException('Billing not configured');
    if (!tenant.stripeCustomerId) throw new BadRequestException('No active subscription');

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${frontendUrl}/dashboard/billing`,
    });

    return { url: session.url };
  }

  /**
   * Handle Stripe webhook events.
   * Validates signature, processes subscription lifecycle events.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!this.stripe) return;

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET')!;
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    this.logger.log(`Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  async getSubscription(tenant: Tenant) {
    if (!tenant.stripeSubscriptionId || !this.stripe) {
      return {
        plan: tenant.subscriptionPlan,
        status: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
        currentPeriodEnd: null,
      };
    }

    const sub = await this.stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
    return {
      plan: tenant.subscriptionPlan,
      status: tenant.subscriptionStatus,
      trialEndsAt: tenant.trialEndsAt,
      currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  }

  // ─── Private webhook handlers ────────────────────────────────────────────

  private async onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const tenantId = session.metadata?.tenantId;
    const plan = session.metadata?.plan as SubscriptionPlan;
    if (!tenantId) return;

    await this.tenantRepo.update(tenantId, {
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionPlan: plan ?? SubscriptionPlan.BASIC,
      stripeSubscriptionId: session.subscription as string,
    });

    this.logger.log(`Subscription activated for tenant ${tenantId} (plan: ${plan})`);
  }

  private async onSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    const status = this.mapStripeStatus(subscription.status);
    await this.tenantRepo.update(tenantId, { subscriptionStatus: status });
  }

  private async onSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    await this.tenantRepo.update(tenantId, {
      subscriptionStatus: SubscriptionStatus.CANCELED,
      stripeSubscriptionId: null,
    });

    this.logger.log(`Subscription canceled for tenant ${tenantId}`);
  }

  private async onPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const tenant = await this.tenantRepo.findOne({ where: { stripeCustomerId: customerId } });
    if (!tenant) return;

    await this.tenantRepo.update(tenant.id, {
      subscriptionStatus: SubscriptionStatus.PAST_DUE,
    });

    this.logger.warn(`Payment failed for tenant ${tenant.id}`);
  }

  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const map: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      unpaid: SubscriptionStatus.PAST_DUE,
      trialing: SubscriptionStatus.TRIAL,
    };
    return map[stripeStatus] ?? SubscriptionStatus.SUSPENDED;
  }
}
