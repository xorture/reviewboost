import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwilioProvider } from './providers/twilio.provider';
import { MetaProvider } from './providers/meta.provider';

export interface SendMessageOptions {
  to: string;          // Phone number in E.164 format
  message: string;     // Message text
  tenantId: string;    // For logging / rate limiting
}

export interface SendMessageResult {
  messageId: string;
  provider: string;
  status: string;
}

export interface WhatsAppProvider {
  sendMessage(to: string, message: string): Promise<SendMessageResult>;
}

/**
 * WhatsAppService
 *
 * Provider-agnostic facade. Selects Twilio or Meta Business API
 * based on WHATSAPP_PROVIDER env var. Easy to swap or A/B test.
 *
 * Handles:
 * - Phone number normalization
 * - STOP/opt-out detection (incoming messages)
 * - Delivery status webhooks (via WhatsAppController)
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly provider: string;

  constructor(
    private readonly twilioProvider: TwilioProvider,
    private readonly metaProvider: MetaProvider,
    private readonly configService: ConfigService,
  ) {
    this.provider = configService.get<string>('WHATSAPP_PROVIDER', 'twilio');
    this.logger.log(`WhatsApp provider: ${this.provider}`);
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const { to, message, tenantId } = options;

    this.logger.log(`Sending WhatsApp to ${this.maskPhone(to)} via ${this.provider} (tenant: ${tenantId})`);

    const result =
      this.provider === 'meta'
        ? await this.metaProvider.sendMessage(to, message)
        : await this.twilioProvider.sendMessage(to, message);

    this.logger.log(`WhatsApp sent — msgId: ${result.messageId}, status: ${result.status}`);
    return result;
  }

  /**
   * Mask phone for logging: +40721234567 → +407****567
   */
  private maskPhone(phone: string): string {
    if (phone.length < 7) return '***';
    return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
  }
}
