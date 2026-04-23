import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';
import { SendMessageResult } from '../whatsapp.service';

@Injectable()
export class TwilioProvider implements OnModuleInit {
  private readonly logger = new Logger(TwilioProvider.name);
  private client: Twilio.Twilio;
  private fromNumber: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886');

    if (accountSid && authToken) {
      this.client = Twilio(accountSid, authToken);
      this.logger.log('Twilio client initialized');
    } else {
      this.logger.warn('Twilio credentials not configured — messages will be mocked');
    }
  }

  async sendMessage(to: string, message: string): Promise<SendMessageResult> {
    // Mock mode when credentials not set (development)
    if (!this.client) {
      this.logger.warn(`[MOCK] Would send WhatsApp to ${to}: ${message.substring(0, 50)}...`);
      return { messageId: `mock_${Date.now()}`, provider: 'twilio', status: 'mock_sent' };
    }

    const twilioMessage = await this.client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      body: message,
    });

    return {
      messageId: twilioMessage.sid,
      provider: 'twilio',
      status: twilioMessage.status,
    };
  }

  /**
   * Validate Twilio webhook signature.
   * Called before processing any incoming webhook from Twilio.
   */
  validateSignature(url: string, params: Record<string, string>, signature: string): boolean {
    if (!this.client) return true; // Skip in mock mode
    return Twilio.validateRequest(
      this.configService.get<string>('TWILIO_AUTH_TOKEN', ''),
      signature,
      url,
      params,
    );
  }
}
