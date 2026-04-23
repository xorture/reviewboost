import {
  Injectable,
  NotFoundException,
  GoneException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackLog, FeedbackStatus, FeedbackType } from './feedback-log.entity';
import { Appointment } from '../appointments/appointment.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { Settings } from '../settings/settings.entity';
import { AlertService } from './alert.service';

export interface FeedbackPageData {
  token: string;
  businessName: string;
  locationName: string;
  customerName: string | null;
  isExpired: boolean;
  isAlreadyRated: boolean;
}

export interface SubmitFeedbackResult {
  feedbackType: FeedbackType;
  /** Only for positive reviews — Google Maps redirect URL */
  googleMapsUrl?: string;
  /** Only for negative reviews — show internal form */
  showInternalForm?: boolean;
}

export interface SubmitNegativeCommentResult {
  success: boolean;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(FeedbackLog)
    private readonly feedbackLogRepo: Repository<FeedbackLog>,

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,

    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,

    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,

    private readonly alertService: AlertService,
  ) {}

  /**
   * Get public-facing data for the feedback page.
   * Called when user opens the link: reviewboost.ro/f/:token
   *
   * Marks feedback log as OPENED on first visit.
   */
  async getFeedbackPage(token: string): Promise<FeedbackPageData> {
    const feedbackLog = await this.feedbackLogRepo.findOne({
      where: { token },
      relations: ['appointment', 'appointment.customer', 'appointment.location'],
    });

    if (!feedbackLog) {
      throw new NotFoundException('Link invalid sau expirat');
    }

    const isExpired =
      feedbackLog.expiresAt !== null && feedbackLog.expiresAt < new Date();

    const isAlreadyRated = feedbackLog.status === FeedbackStatus.RATED;

    // Mark as opened on first visit (if sent and not yet opened)
    if (
      feedbackLog.status === FeedbackStatus.SENT &&
      !feedbackLog.openedAt
    ) {
      await this.feedbackLogRepo.update(feedbackLog.id, {
        status: FeedbackStatus.OPENED,
        openedAt: new Date(),
      });
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: feedbackLog.tenantId },
    });

    const appointment = feedbackLog.appointment;
    const customer = appointment?.customer;
    const location = appointment?.location;

    return {
      token,
      businessName: tenant?.businessName ?? 'Afacerea noastră',
      locationName: location?.locationName ?? '',
      customerName: customer?.fullName ?? null,
      isExpired,
      isAlreadyRated,
    };
  }

  /**
   * ============================================================
   * THE CORE REVIEW GATING LOGIC
   * ============================================================
   *
   * User submitted a star rating (1-5).
   *
   * Positive (>= threshold, default 4-5 stars):
   *   → Return Google Maps deep-link URL for redirect
   *
   * Negative (< threshold, default 1-3 stars):
   *   → Return flag to show internal feedback form
   *   → Immediately send alert to tenant owner
   *
   * ============================================================
   */
  async submitRating(
    token: string,
    score: number,
  ): Promise<SubmitFeedbackResult> {
    if (score < 1 || score > 5) {
      throw new BadRequestException('Score must be between 1 and 5');
    }

    const feedbackLog = await this.feedbackLogRepo.findOne({
      where: { token },
      relations: ['appointment', 'appointment.location'],
    });

    if (!feedbackLog) throw new NotFoundException('Link invalid');

    // Already rated — idempotent response
    if (feedbackLog.status === FeedbackStatus.RATED) {
      return this.buildResult(feedbackLog, feedbackLog.score!);
    }

    // Expired link
    if (feedbackLog.expiresAt && feedbackLog.expiresAt < new Date()) {
      throw new GoneException('Acest link a expirat');
    }

    // Load settings to get threshold
    const settings = await this.settingsRepo.findOne({
      where: { tenantId: feedbackLog.tenantId },
    });
    const threshold = settings?.positiveScoreThreshold ?? 4;

    const isPositive = score >= threshold;
    const feedbackType = isPositive ? FeedbackType.POSITIVE : FeedbackType.NEGATIVE;

    // Get Google Maps URL for positive redirect
    let googleMapsUrl: string | undefined;
    if (isPositive) {
      const location = feedbackLog.appointment?.location;
      const tenant = await this.tenantRepo.findOne({
        where: { id: feedbackLog.tenantId },
      });

      // Priority: location-specific URL > tenant-level URL
      googleMapsUrl =
        location?.googleReviewUrl ??
        tenant?.googleMapsReviewUrl ??
        this.buildGoogleMapsUrl(
          location?.googlePlaceId ?? tenant?.googlePlaceId,
        );
    }

    // Update feedback log
    await this.feedbackLogRepo.update(feedbackLog.id, {
      score,
      feedbackType,
      status: FeedbackStatus.RATED,
      ratedAt: new Date(),
    });

    // For negative reviews — send immediate alert to tenant
    if (!isPositive) {
      await this.alertService.sendNegativeAlert({
        tenantId: feedbackLog.tenantId,
        feedbackLogId: feedbackLog.id,
        score,
        appointmentId: feedbackLog.appointmentId,
      });
    }

    this.logger.log(
      `Feedback submitted — token: ${token}, score: ${score}/5, type: ${feedbackType}`,
    );

    return { feedbackType, googleMapsUrl, showInternalForm: !isPositive };
  }

  /**
   * Submit internal negative feedback comment.
   * Called after user fills the "Tell us what went wrong" form.
   */
  async submitNegativeComment(
    token: string,
    comment: string,
  ): Promise<SubmitNegativeCommentResult> {
    const feedbackLog = await this.feedbackLogRepo.findOne({ where: { token } });

    if (!feedbackLog) throw new NotFoundException('Link invalid');

    if (feedbackLog.feedbackType !== FeedbackType.NEGATIVE) {
      throw new BadRequestException('Not a negative feedback');
    }

    await this.feedbackLogRepo.update(feedbackLog.id, {
      comment: comment.trim().substring(0, 2000), // Max 2000 chars
    });

    // Update alert with comment (if alert was already sent)
    if (feedbackLog.alertSent) {
      await this.alertService.updateAlertWithComment({
        tenantId: feedbackLog.tenantId,
        feedbackLogId: feedbackLog.id,
        comment,
        score: feedbackLog.score!,
      });
    }

    this.logger.log(`Negative comment received for token ${token}`);

    return { success: true };
  }

  /**
   * Analytics: Get feedback stats for a tenant.
   */
  async getStats(tenantId: string, days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [logs, total] = await this.feedbackLogRepo.findAndCount({
      where: { tenantId },
    });

    const recentLogs = await this.feedbackLogRepo
      .createQueryBuilder('fl')
      .where('fl.tenant_id = :tenantId', { tenantId })
      .andWhere('fl.created_at >= :since', { since })
      .getMany();

    const sent = recentLogs.filter((l) => l.status !== FeedbackStatus.SKIPPED).length;
    const opened = recentLogs.filter((l) =>
      [FeedbackStatus.OPENED, FeedbackStatus.RATED].includes(l.status),
    ).length;
    const rated = recentLogs.filter((l) => l.status === FeedbackStatus.RATED).length;
    const positive = recentLogs.filter((l) => l.feedbackType === FeedbackType.POSITIVE).length;
    const negative = recentLogs.filter((l) => l.feedbackType === FeedbackType.NEGATIVE).length;

    const scores = recentLogs
      .filter((l) => l.score !== null)
      .map((l) => l.score as number);
    const avgScore = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    return {
      period: `${days}d`,
      sent,
      opened,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      rated,
      conversionRate: sent > 0 ? Math.round((rated / sent) * 100) : 0,
      positive,
      negative,
      avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
      googleRedirects: positive,
      internalComments: recentLogs.filter((l) => l.comment).length,
    };
  }

  /**
   * Get negative feedback feed for tenant dashboard.
   */
  async getNegativeFeed(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const [data, total] = await this.feedbackLogRepo.findAndCount({
      where: { tenantId, feedbackType: FeedbackType.NEGATIVE },
      relations: ['appointment', 'appointment.customer', 'appointment.location'],
      order: { ratedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  private buildResult(
    feedbackLog: FeedbackLog,
    score: number,
  ): SubmitFeedbackResult {
    return {
      feedbackType: feedbackLog.feedbackType ?? FeedbackType.NEGATIVE,
      googleMapsUrl: undefined,
      showInternalForm: feedbackLog.feedbackType === FeedbackType.NEGATIVE,
    };
  }

  private buildGoogleMapsUrl(placeId: string | null | undefined): string | undefined {
    if (!placeId) return undefined;
    return `https://search.google.com/local/writereview?placeid=${placeId}`;
  }
}
