import {
  Entity,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { Location } from '../locations/location.entity';
import { Customer } from '../customers/customer.entity';
import { Settings } from '../settings/settings.entity';

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  SUSPENDED = 'suspended',
}

export enum SubscriptionPlan {
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

@Entity('tenants')
@Index(['email'], { unique: true })
export class Tenant extends AppBaseEntity {
  @Column({ name: 'business_name', length: 255 })
  businessName: string;

  @Column({ length: 13, nullable: true, comment: 'Romanian CUI / VAT number' })
  cui: string;

  @Column({ length: 255 })
  address: string;

  @Column({ name: 'owner_name', length: 255 })
  ownerName: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'phone_number', length: 20, nullable: true })
  phoneNumber: string;

  // Google Maps integration
  @Column({ name: 'google_place_id', nullable: true })
  googlePlaceId: string;

  @Column({ name: 'google_maps_review_url', nullable: true })
  googleMapsReviewUrl: string;

  // Subscription
  @Column({
    name: 'subscription_status',
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIAL,
  })
  subscriptionStatus: SubscriptionStatus;

  @Column({
    name: 'subscription_plan',
    type: 'enum',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.BASIC,
  })
  subscriptionPlan: SubscriptionPlan;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt: Date;

  // Stripe
  @Column({ name: 'stripe_customer_id', nullable: true })
  stripeCustomerId: string;

  @Column({ name: 'stripe_subscription_id', nullable: true })
  stripeSubscriptionId: string;

  // Meta - tracks usage
  @Column({ name: 'messages_sent_this_month', default: 0 })
  messagesSentThisMonth: number;

  @Column({ name: 'messages_reset_at', type: 'timestamptz', nullable: true })
  messagesResetAt: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  // Relations
  @OneToMany(() => Location, (location) => location.tenant, { cascade: true })
  locations: Location[];

  @OneToMany(() => Customer, (customer) => customer.tenant, { cascade: true })
  customers: Customer[];

  @OneToMany(() => Settings, (settings) => settings.tenant, { cascade: true })
  settings: Settings[];
}
