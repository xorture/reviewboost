import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import { Appointment, AppointmentStatus } from '../appointments/appointment.entity';
import { FeedbackLog, FeedbackStatus, FeedbackChannel } from '../feedback/feedback-log.entity';
import { Settings } from '../settings/settings.entity';
import { Customer } from '../customers/customer.entity';
import { CustomersService } from '../customers/customers.service';
import { REVIEW_QUEUE } from './scheduler.module';
import { ConfigService } from '@nestjs/config';

export interface ReviewJobData {
  appointmentId: string;
  customerId: string;
  tenantId: string;
  locationId: string;
  feedbackLogId: string;
  token: string;
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(REVIEW_QUEUE)
    private readonly reviewQueue: Queue<ReviewJobData>,

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    @InjectRepository(FeedbackLog)
    private readonly feedbackLogRepo: Repository<FeedbackLog>,

    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,

    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    private readonly customersService: CustomersService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Called when an appointment is marked as COMPLETED.
   * Schedules a WhatsApp review request with configurable delay.
   *
   * Flow:
   *  1. Load tenant settings (delay, spam filter days)
   *  2. Check if appointment already has a job (idempotent)
   *  3. Check blacklist
   *  4. Check spam filter (sent in last X days)
   *  5. Create FeedbackLog record with QUEUED status
   *  6. Enqueue BullMQ job with delay
   */
  async scheduleReviewRequest(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['customer', 'location'],
    });

    if (!appointment) {
      this.logger.error(`Appointment not found: ${appointmentId}`);
      return;
    }

    if (appointment.status !== AppointmentStatus.COMPLETED) {
      this.logger.warn(`Appointment ${appointmentId} is not completed, skipping`);
      return;
    }

    // Idempotency: already scheduled?
    if (appointment.reviewJobId) {
      this.logger.warn(`Appointment ${appointmentId} already has a review job, skipping`);
      return;
    }

    const customer = appointment.customer;
    const tenantId = appointment.location.tenantId;

    // Load tenant settings
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    const delayMinutes = settings?.delayMinutes ?? 60;
    const spamFilterDays = settings?.spamFilterDays ?? 30;

    // === SPAM FILTER ===
    if (customer.isBlacklisted) {
      this.logger.log(`Customer ${customer.id} is blacklisted — skipping`);
      await this.createSkippedFeedbackLog(appointment, tenantId, 'blacklisted');
      return;
    }

    const isFiltered = await this.customersService.isSpamFiltered(customer, spamFilterDays);
    if (isFiltered) {
      this.logger.log(
        `Customer ${customer.id} spam-filtered (sent within ${spamFilterDays} days) — skipping`,
      );
      await this.createSkippedFeedbackLog(appointment, tenantId, 'spam_filtered');
      return;
    }

    // === CREATE FEEDBACK LOG ===
    const token = nanoid(16); // Unique token for feedback URL
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h expiry

    const feedbackLog = await this.feedbackLogRepo.save(
      this.feedbackLogRepo.create({
        appointmentId: appointment.id,
        tenantId,
        token,
        channel: FeedbackChannel.WHATSAPP,
        status: FeedbackStatus.QUEUED,
        expiresAt,
      }),
    );

    // === ENQUEUE JOB WITH DELAY ===
    const delayMs = delayMinutes * 60 * 1000;

    const jobData: ReviewJobData = {
      appointmentId: appointment.id,
      customerId: customer.id,
      tenantId,
      locationId: appointment.locationId,
      feedbackLogId: feedbackLog.id,
      token,
    };

    const jobOptions: JobsOptions = {
      delay: delayMs,
      jobId: `review-${appointment.id}`, // Prevent duplicates in queue
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 }, // 1min, 2min, 4min retries
    };

    const job = await this.reviewQueue.add('send-review-request', jobData, jobOptions);

    // Save job ID to appointment
    await this.appointmentRepo.update(appointment.id, { reviewJobId: String(job.id) });

    this.logger.log(
      `Review job ${job.id} queued for appointment ${appointmentId} — delay: ${delayMinutes}min`,
    );
  }

  /**
   * Cancel a pending review job (e.g., appointment was canceled after completion).
   */
  async cancelReviewJob(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({ where: { id: appointmentId } });
    if (!appointment?.reviewJobId) return;

    try {
      const job = await this.reviewQueue.getJob(appointment.reviewJobId);
      if (job) {
        await job.remove();
        this.logger.log(`Review job ${appointment.reviewJobId} canceled`);
      }
    } catch (err) {
      this.logger.error(`Failed to cancel job ${appointment.reviewJobId}: ${(err as Error).message}`);
    }
  }

  /**
   * Get queue stats for dashboard.
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.reviewQueue.getWaitingCount(),
      this.reviewQueue.getActiveCount(),
      this.reviewQueue.getCompletedCount(),
      this.reviewQueue.getFailedCount(),
      this.reviewQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Create a FeedbackLog record for skipped appointments (spam filter / blacklist).
   * Keeps audit trail.
   */
  private async createSkippedFeedbackLog(
    appointment: Appointment,
    tenantId: string,
    reason: string,
  ): Promise<void> {
    const existing = await this.feedbackLogRepo.findOne({
      where: { appointmentId: appointment.id },
    });
    if (existing) return;

    await this.feedbackLogRepo.save(
      this.feedbackLogRepo.create({
        appointmentId: appointment.id,
        tenantId,
        token: `skipped_${nanoid(8)}`,
        channel: FeedbackChannel.WHATSAPP,
        status: FeedbackStatus.SKIPPED,
      }),
    );
  }
}
