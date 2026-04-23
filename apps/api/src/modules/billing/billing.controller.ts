import {
  Controller, Get, Post, Body, Req,
  Headers, HttpCode, HttpStatus, RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { IsEnum } from 'class-validator';
import { BillingService } from './billing.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { SubscriptionPlan } from '../tenants/tenant.entity';

class CreateCheckoutDto {
  @IsEnum(SubscriptionPlan) plan: SubscriptionPlan;
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('subscription')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current subscription info' })
  getSubscription(@CurrentTenant() tenant: Tenant) {
    return this.billingService.getSubscription(tenant);
  }

  @Post('checkout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  createCheckout(@CurrentTenant() tenant: Tenant, @Body() dto: CreateCheckoutDto) {
    return this.billingService.createCheckoutSession(tenant, dto.plan);
  }

  @Post('portal')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe customer portal session' })
  createPortal(@CurrentTenant() tenant: Tenant) {
    return this.billingService.createPortalSession(tenant);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.rawBody!, signature);
  }
}
