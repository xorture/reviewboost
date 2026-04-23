import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { REVIEW_QUEUE, ReviewJobData } from '../scheduler.service';
import { FeedbackLog, FeedbackStatus } from '../../feedback/feedback-log.entity';
import { Appointment } from '../../appointments/appointment.entity';
import { Customer } from '../../customers/customer.entity';
import { Settings } from '../../settings/settings.entity';
import { Location } from '../../locations/location.entity';
import { Tenant } from '../../tenants/tenant.entity';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { CustomersService } from '../../customers/customers.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { ConfigService } from '@nestjs/config';

@Processor(REVIEW_QUEUE, {
  concurrency: 10, // Process up to 10 jobs simultaneously
})
export class ReviewJobProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewJobProcessor.name);

  constructor(
    @InjectRepository(FeedbackLog)
    private readonly feedbackLogRepo: Repository<FeedbackLog>,

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,

    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,

    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,

    private readonly whatsAppService: WhatsAppService,
    private readonly customersService: CustomersService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  /**
   * Main job handler - called by BullMQ when the delayed job fires.
   *
   * Critical guarantees:
   * 1. Re-check spam filter at execution time (customer may have gotten another message since job was queued)
   * 2. Re-check blacklist (customer may have opted out)
   * 3. Check feedback log not already sent (idempotency)
   * 4. Send WhatsApp
   * 5. Update FeedbackLog + Customer.lastReviewSentAt + Appointment.reviewSentAt
   */
  async process(job: Job<ReviewJobData>): Promise<void> {
    const { appointmentId, customerId, tenantId, feedbackLogId, token } = job.data;

    this.logger.log(`Processing review job ${job.id} for appointment ${appointmentId}`);

    // Load feedback log — check it's still in QUEUED status
    const feedbackLog = await this.feedbackLogRepo.findOne({ where: { id: feedbackLogId } });
    if (!feedbackLog) {
      this.logger.warn(`FeedbackLog ${feedbackLogId} not found — job abandoned`);
      return;
    }

    if (feedbackLog.status !== FeedbackStatus.QUEUED) {
      this.logger.warn(
        `FeedbackLog ${feedbackLogId} already in status ${feedbackLog.status} — skipping (idempotency)`,
      );
      return;
    }

    // Load customer (re-check blacklist at send time)
    const customer = await this.customerRepo.findOne({ where: { id: customerId } });
    if (!customer) {
      await this.markFailed(feedbackLog, 'Customer not found');
      return;
    }

    if (customer.isBlacklisted) {
      await this.markSkipped(feedbackLog, 'Customer blacklisted at send time');
      return;
    }

    // Re-check spam filter at execution time
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    const spamFilterDays = settings?.spamFilterDays ?? 30;

    const isFiltered = await this.customersService.isSpamFiltered(customer, spamFilterDays);
    if (isFiltered) {
      await this.markSkipped(feedbackLog, 'Spam filter triggered at send time');
      return;
    }

    // Load location + tenant for message context
    const location = await this.locationRepo.findOne({ where: { id: job.data.locationId } });
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });

    if (!location || !tenant) {
      await this.markFailed(feedbackLog, 'Location or tenant not found');
      return;
    }

    // Decrypt phone number for sending
    let phoneNumber: string;
    try {
      phoneNumber = this.encryptionService.decrypt(customer.phoneEncrypted);
    } catch {
      await this.markFailed(feedbackLog, 'Failed to decrypt phone number');
      return;
    }

    // Build feedback URL
    const feedbackBaseUrl = this.configService.get<string>('FEEDBACK_BASE_URL', 'https://reviewboost.ro/f');
    const feedbackUrl = `${feedbackBaseUrl}/${token}`;

    // Render message template
    const messageTemplate = settings?.messageTemplate ?? '';
    const message = this.renderTemplate(messageTemplate, {
      client_name: customer.fullName ?? 'Clientule',
      business_name: tenant.businessName,
      service: '', // TODO: from appointment
      feedback_url: feedbackUrl,
    });

    // === SEND WHATSAPP ===
    let messageId: string;
    try {
      const result = await this.whatsAppService.sendMessage({
        to: phoneNumber,
        message,
        tenantId,
      });
      messageId = result.messageId;
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(`WhatsApp send failed for job ${job.id}: ${errorMsg}`);
      await this.markFailed(feedbackLog, errorMsg);
      throw err; // Re-throw to trigger BullMQ retry
    }

    // === SUCCESS — update all records ===
    const now = new Date();

    await Promise.all([
      // Update FeedbackLog to SENT
      this.feedbackLogRepo.update(feedbackLog.id, {
        status: FeedbackStatus.SENT,
        sentAt: now,
        whatsappMessageId: messageId,
      }),

      // Update Customer.lastReviewSentAt (for spam filter)
      this.customersService.markReviewSent(customerId),

      // Update Appointment.reviewSentAt
      this.appointmentRepo.update(appointmentId, { reviewSentAt: now }),
    ]);

    this.logger.log(
      `✅ Review WhatsApp sent successfully — job: ${job.id}, appointment: ${appointmentId}, msgId: ${messageId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ReviewJobData>, err: Error): void {
    this.logger.error(
      `Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`,
      err.stack,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ReviewJobData>): void {
    this.logger.debug(`Job ${job.id} completed successfully`);
  }

  /**
   * Render message template with variable substitution.
   * Replaces {{variable_name}} placeholders.
   */
  private renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  }

  private async markFailed(feedbackLog: FeedbackLog, reason: string): Promise<void> {
    await this.feedbackLogRepo.update(feedbackLog.id, { status: FeedbackStatus.FAILED });
    this.logger.warn(`FeedbackLog ${feedbackLog.id} marked FAILED: ${reason}`);
  }

  private async markSkipped(feedbackLog: FeedbackLog, reason: string): Promise<void> {
    await this.feedbackLogRepo.update(feedbackLog.id, { status: FeedbackStatus.SKIPPED });
    this.logger.log(`FeedbackLog ${feedbackLog.id} marked SKIPPED: ${reason}`);
  }
}
