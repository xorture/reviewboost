import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { WebhooksService } from './webhooks.service';

/**
 * Webhook endpoint for external platforms (Mero, Stailer, custom).
 *
 * URL pattern: POST /api/v1/webhooks/:platform/:locationToken
 *
 * Each location gets a unique webhook URL based on its ID.
 * Webhook secret is validated via HMAC-SHA256 signature.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Mero webhook — appointment completed.
   * Mero sends POST with HMAC-SHA256 signature in X-Mero-Signature header.
   */
  @Public()
  @Post('mero/:locationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mero appointment webhook' })
  @ApiParam({ name: 'locationId', description: 'ReviewBoost location UUID' })
  async meroWebhook(
    @Param('locationId') locationId: string,
    @Body() body: MeroWebhookPayload,
    @Headers('x-mero-signature') signature: string,
    @Headers('x-mero-timestamp') timestamp: string,
  ) {
    // Validate HMAC signature
    this.validateMeroSignature(JSON.stringify(body), signature, timestamp);

    await this.webhooksService.processMeroEvent(locationId, body);
    return { received: true };
  }

  /**
   * Generic webhook — for custom integrations.
   * Uses API key in Authorization header.
   */
  @Public()
  @Post('generic/:locationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generic appointment completed webhook' })
  async genericWebhook(
    @Param('locationId') locationId: string,
    @Body() body: GenericWebhookPayload,
    @Headers('authorization') authHeader: string,
  ) {
    // Validate Bearer token matches location's API key
    const token = authHeader?.replace('Bearer ', '');
    await this.webhooksService.validateLocationApiKey(locationId, token);
    await this.webhooksService.processGenericEvent(locationId, body);
    return { received: true };
  }

  /**
   * Validate Mero HMAC-SHA256 signature.
   * Prevents unauthorized webhook injection.
   */
  private validateMeroSignature(
    payload: string,
    signature: string,
    timestamp: string,
  ): void {
    const secret = this.configService.get<string>('MERO_WEBHOOK_SECRET', '');
    if (!secret) return; // Skip validation in dev if secret not set

    // Prevent replay attacks — reject if timestamp > 5 minutes old
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      throw new UnauthorizedException('Webhook timestamp expired');
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    if (signature !== `sha256=${expected}`) {
      this.logger.warn('Invalid Mero webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}

// Mero webhook payload types
interface MeroWebhookPayload {
  event: string;  // 'appointment.completed' | 'appointment.canceled' etc.
  appointment: {
    id: string;
    clientPhone: string;
    clientName: string;
    clientEmail?: string;
    serviceName: string;
    staffName?: string;
    status: string;
    startTime: string;
    endTime?: string;
  };
}

// Generic webhook payload
interface GenericWebhookPayload {
  externalId: string;
  clientPhone: string;
  clientName?: string;
  clientEmail?: string;
  serviceName?: string;
  staffName?: string;
  startTime: string;
  endTime?: string;
}
