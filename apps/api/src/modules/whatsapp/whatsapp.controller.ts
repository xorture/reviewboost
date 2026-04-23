import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Customer } from '../customers/customer.entity';
import { FeedbackLog, FeedbackStatus } from '../feedback/feedback-log.entity';
import { CustomersService } from '../customers/customers.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { TwilioProvider } from './providers/twilio.provider';
import { MetaProvider } from './providers/meta.provider';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(FeedbackLog)
    private readonly feedbackLogRepo: Repository<FeedbackLog>,

    private readonly customersService: CustomersService,
    private readonly encryptionService: EncryptionService,
    private readonly twilioProvider: TwilioProvider,
    private readonly metaProvider: MetaProvider,
  ) {}

  /**
   * Twilio webhook — incoming messages (STOP opt-out handling).
   * Twilio sends a POST when a user replies to our WhatsApp message.
   */
  @Public()
  @Post('twilio/incoming')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Twilio incoming message webhook' })
  async twilioIncoming(
    @Body() body: Record<string, string>,
    @Headers('x-twilio-signature') signature: string,
    @Req() req: Request,
  ): Promise<string> {
    // Validate webhook signature
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!this.twilioProvider.validateSignature(url, body, signature)) {
      this.logger.warn('Invalid Twilio webhook signature');
      return '<?xml version="1.0"?><Response></Response>';
    }

    const fromPhone = body['From']?.replace('whatsapp:', '');
    const messageBody = body['Body']?.trim().toUpperCase();

    if (!fromPhone) {
      return '<?xml version="1.0"?><Response></Response>';
    }

    this.logger.log(`Incoming WhatsApp from ${this.maskPhone(fromPhone)}: "${messageBody}"`);

    // Handle STOP / opt-out keywords
    const stopKeywords = ['STOP', 'DEZABONARE', 'STOP RECENZII', 'NU', 'CANCEL'];
    if (stopKeywords.some((kw) => messageBody?.includes(kw))) {
      await this.handleOptOut(fromPhone);
      return this.twilioTwiML('Ai fost dezabonat cu succes. Nu vei mai primi mesaje de la noi.');
    }

    // Return empty TwiML for other messages
    return '<?xml version="1.0"?><Response></Response>';
  }

  /**
   * Twilio delivery status webhook.
   * Updates FeedbackLog when message is delivered/failed.
   */
  @Public()
  @Post('twilio/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Twilio delivery status webhook' })
  async twilioStatus(@Body() body: Record<string, string>): Promise<void> {
    const messageSid = body['MessageSid'];
    const status = body['MessageStatus']; // sent, delivered, read, failed, undelivered

    if (!messageSid || !status) return;

    this.logger.debug(`Twilio status update: ${messageSid} → ${status}`);

    if (status === 'opened' || status === 'read') {
      await this.feedbackLogRepo
        .createQueryBuilder()
        .update()
        .set({ status: FeedbackStatus.OPENED, openedAt: new Date() })
        .where('whatsapp_message_id = :sid AND status != :rated', {
          sid: messageSid,
          rated: FeedbackStatus.RATED,
        })
        .execute();
    }
  }

  /**
   * Meta webhook verification (GET).
   */
  @Public()
  @Get('meta/webhook')
  @ApiOperation({ summary: 'Meta webhook verification' })
  metaVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const result = this.metaProvider.verifyWebhook(mode, token, challenge);
    if (!result) {
      this.logger.warn('Meta webhook verification failed');
      return 'Verification failed';
    }
    return result;
  }

  /**
   * Meta webhook events (POST) — incoming messages + status updates.
   */
  @Public()
  @Post('meta/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Meta Business API webhook' })
  async metaWebhook(@Body() body: MetaWebhookPayload): Promise<string> {
    if (body.object !== 'whatsapp_business_account') return 'ok';

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        // Incoming messages
        for (const message of value.messages ?? []) {
          if (message.type === 'text') {
            const text = message.text?.body?.trim().toUpperCase() ?? '';
            const phone = `+${message.from}`;

            const stopKeywords = ['STOP', 'DEZABONARE', 'NU', 'CANCEL'];
            if (stopKeywords.some((kw) => text.includes(kw))) {
              await this.handleOptOut(phone);
            }
          }
        }

        // Status updates
        for (const status of value.statuses ?? []) {
          if (status.status === 'read') {
            await this.feedbackLogRepo
              .createQueryBuilder()
              .update()
              .set({ status: FeedbackStatus.OPENED, openedAt: new Date() })
              .where('whatsapp_message_id = :id', { id: status.id })
              .execute();
          }
        }
      }
    }

    return 'ok';
  }

  /**
   * Opt-out handler: find and blacklist customer by phone.
   */
  private async handleOptOut(phone: string): Promise<void> {
    const phoneHash = this.encryptionService.hashPhone(phone);

    // Find across all tenants (phone may be in multiple tenants)
    const customers = await this.customerRepo.find({ where: { phoneHash } });

    for (const customer of customers) {
      await this.customersService.blacklist(customer.tenantId, phoneHash);
    }

    this.logger.log(
      `Opt-out processed for ${this.maskPhone(phone)} — ${customers.length} tenant(s) blacklisted`,
    );
  }

  private twilioTwiML(message: string): string {
    return `<?xml version="1.0"?><Response><Message>${message}</Message></Response>`;
  }

  private maskPhone(phone: string): string {
    if (phone.length < 7) return '***';
    return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
  }
}

// Meta webhook payload types
interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    changes: Array<{
      value: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
        }>;
      };
    }>;
  }>;
}
