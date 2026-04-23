import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SendMessageResult } from '../whatsapp.service';

interface MetaMessageResponse {
  messages: Array<{ id: string }>;
  contacts: Array<{ wa_id: string }>;
}

@Injectable()
export class MetaProvider {
  private readonly logger = new Logger(MetaProvider.name);
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';

  constructor(private readonly configService: ConfigService) {}

  async sendMessage(to: string, message: string): Promise<SendMessageResult> {
    const token = this.configService.get<string>('META_WHATSAPP_TOKEN');
    const phoneNumberId = this.configService.get<string>('META_PHONE_NUMBER_ID');

    if (!token || !phoneNumberId) {
      this.logger.warn(`[MOCK] Would send WhatsApp to ${to} via Meta`);
      return { messageId: `mock_meta_${Date.now()}`, provider: 'meta', status: 'mock_sent' };
    }

    // Normalize phone: remove + prefix for Meta API
    const normalizedTo = to.replace(/^\+/, '');

    const response = await axios.post<MetaMessageResponse>(
      `${this.baseUrl}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: 'text',
        text: { preview_url: true, body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    const messageId = response.data.messages?.[0]?.id ?? 'unknown';

    return { messageId, provider: 'meta', status: 'sent' };
  }

  /**
   * Verify Meta webhook challenge (GET request from Meta during setup).
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.configService.get<string>('META_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return null;
  }
}
