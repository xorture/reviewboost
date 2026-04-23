import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, GoneException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackLog, FeedbackStatus, FeedbackType } from './feedback-log.entity';
import { Appointment } from '../appointments/appointment.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { Settings } from '../settings/settings.entity';
import { AlertService } from './alert.service';

const makeFeedbackLog = (overrides: Partial<FeedbackLog> = {}): FeedbackLog => ({
  id: 'fl-uuid-1',
  appointmentId: 'appt-uuid-1',
  tenantId: 'tenant-uuid-1',
  token: 'valid_token_123',
  channel: 'whatsapp' as any,
  status: FeedbackStatus.SENT,
  sentAt: new Date(),
  openedAt: null,
  ratedAt: null,
  score: null,
  comment: null,
  feedbackType: null,
  alertSent: false,
  whatsappMessageId: 'twilio-sid-123',
  expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h from now
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  appointment: {
    id: 'appt-uuid-1',
    customer: { id: 'cust-1', fullName: 'Ion Popescu' } as any,
    location: {
      id: 'loc-1',
      locationName: 'Salon Central',
      googlePlaceId: 'ChIJd8BlQ2BZwokRAFUEcm_qrcA',
      googleReviewUrl: null,
    } as any,
  } as any,
  ...overrides,
});

const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
  id: 'settings-1',
  tenantId: 'tenant-uuid-1',
  positiveScoreThreshold: 4, // 4-5 → positive
  delayMinutes: 60,
  messageTemplate: 'Test',
  spamFilterDays: 30,
  notifyNegativeEmail: true,
  notifyNegativeWhatsapp: false,
  notificationEmail: 'owner@test.com',
  notificationPhone: null,
  isActive: true,
  whatsappDisplayName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  tenant: null as any,
  ...overrides,
});

describe('FeedbackService', () => {
  let service: FeedbackService;
  let feedbackLogRepo: any;
  let settingsRepo: any;
  let tenantRepo: any;
  let alertService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        {
          provide: getRepositoryToken(FeedbackLog),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Tenant),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'tenant-uuid-1',
              businessName: 'Salonul Test',
              googleMapsReviewUrl: null,
              googlePlaceId: null,
            }),
          },
        },
        {
          provide: getRepositoryToken(Location),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Settings),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: AlertService,
          useValue: {
            sendNegativeAlert: jest.fn().mockResolvedValue(undefined),
            updateAlertWithComment: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    feedbackLogRepo = module.get(getRepositoryToken(FeedbackLog));
    settingsRepo = module.get(getRepositoryToken(Settings));
    tenantRepo = module.get(getRepositoryToken(Tenant));
    alertService = module.get(AlertService);

    jest.clearAllMocks();
  });

  // ─── Review Gating Logic ─────────────────────────────────────────────────

  describe('submitRating — review gating', () => {
    it('should redirect to Google Maps for 5-star rating (positive)', async () => {
      const log = makeFeedbackLog();
      feedbackLogRepo.findOne.mockResolvedValue(log);
      settingsRepo.findOne.mockResolvedValue(makeSettings({ positiveScoreThreshold: 4 }));
      feedbackLogRepo.update.mockResolvedValue({});

      const result = await service.submitRating('valid_token_123', 5);

      expect(result.feedbackType).toBe(FeedbackType.POSITIVE);
      expect(result.googleMapsUrl).toContain('ChIJd8BlQ2BZwokRAFUEcm_qrcA');
      expect(result.showInternalForm).toBeFalsy();
    });

    it('should redirect to Google Maps for 4-star rating (at threshold)', async () => {
      const log = makeFeedbackLog();
      feedbackLogRepo.findOne.mockResolvedValue(log);
      settingsRepo.findOne.mockResolvedValue(makeSettings({ positiveScoreThreshold: 4 }));
      feedbackLogRepo.update.mockResolvedValue({});

      const result = await service.submitRating('valid_token_123', 4);

      expect(result.feedbackType).toBe(FeedbackType.POSITIVE);
      expect(result.googleMapsUrl).toBeDefined();
    });

    it('should show internal form for 3-star rating (negative)', async () => {
      const log = makeFeedbackLog();
      feedbackLogRepo.findOne.mockResolvedValue(log);
      settingsRepo.findOne.mockResolvedValue(makeSettings({ positiveScoreThreshold: 4 }));
      feedbackLogRepo.update.mockResolvedValue({});

      const result = await service.submitRating('valid_token_123', 3);

      expect(result.feedbackType).toBe(FeedbackType.NEGATIVE);
      expect(result.showInternalForm).toBe(true);
      expect(result.googleMapsUrl).toBeUndefined();
    });

    it('should show internal form for 1-star rating (negative)', async () => {
      const log = makeFeedbackLog();
      feedbackLogRepo.findOne.mockResolvedValue(log);
      settingsRepo.findOne.mockResolvedValue(makeSettings());
      feedbackLogRepo.update.mockResolvedValue({});

      const result = await service.submitRating('valid_token_123', 1);

      expect(result.feedbackType).toBe(FeedbackType.NEGATIVE);
      expect(result.showInternalForm).toBe(true);
    });

    it('should send negative alert for low ratings', async () => {
      const log = makeFeedbackLog();
      feedbackLogRepo.findOne.mockResolvedValue(log);
      settingsRepo.findOne.mockResolvedValue(makeSettings());
      feedbackLogRepo.update.mockResolvedValue({});

      await service.submitRating('valid_token_123', 2);

      expect(alertService.sendNegativeAlert).toHaveBeenCalledWith(
        expect.objectContaining({ score: 2, tenantId: 'tenant-uuid-1' }),
      );
    });

    it('should NOT send alert for positive ratings', async () => {
      const log = makeFeedbackLog();
      feedbackLogRepo.findOne.mockResolvedValue(log);
      settingsRepo.findOne.mockResolvedValue(makeSettings());
      feedbackLogRepo.update.mockResolvedValue({});

      await service.submitRating('valid_token_123', 5);

      expect(alertService.sendNegativeAlert).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid token', async () => {
      feedbackLogRepo.findOne.mockResolvedValue(null);

      await expect(
        service.submitRating('invalid_token', 5),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw GoneException for expired link', async () => {
      const expiredLog = makeFeedbackLog({
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });
      feedbackLogRepo.findOne.mockResolvedValue(expiredLog);
      settingsRepo.findOne.mockResolvedValue(makeSettings());

      await expect(
        service.submitRating('valid_token_123', 5),
      ).rejects.toThrow(GoneException);
    });

    it('should handle custom positive threshold (threshold = 3)', async () => {
      const log = makeFeedbackLog();
      feedbackLogRepo.findOne.mockResolvedValue(log);
      settingsRepo.findOne.mockResolvedValue(makeSettings({ positiveScoreThreshold: 3 }));
      feedbackLogRepo.update.mockResolvedValue({});

      const result = await service.submitRating('valid_token_123', 3);

      // With threshold=3, score 3 should be POSITIVE
      expect(result.feedbackType).toBe(FeedbackType.POSITIVE);
    });

    it('should be idempotent — return same result for already-rated link', async () => {
      const alreadyRatedLog = makeFeedbackLog({
        status: FeedbackStatus.RATED,
        score: 5,
        feedbackType: FeedbackType.POSITIVE,
      });
      feedbackLogRepo.findOne.mockResolvedValue(alreadyRatedLog);

      const result = await service.submitRating('valid_token_123', 5);

      // Should not call update again
      expect(feedbackLogRepo.update).not.toHaveBeenCalled();
      expect(result.feedbackType).toBe(FeedbackType.POSITIVE);
    });
  });
});
