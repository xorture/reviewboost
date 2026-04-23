import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { SchedulerService, REVIEW_QUEUE } from './scheduler.service';
import { Appointment, AppointmentStatus } from '../appointments/appointment.entity';
import { FeedbackLog, FeedbackStatus } from '../feedback/feedback-log.entity';
import { Customer } from '../customers/customer.entity';
import { Settings } from '../settings/settings.entity';
import { CustomersService } from '../customers/customers.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'customer-uuid-1',
  tenantId: 'tenant-uuid-1',
  fullName: 'Ion Popescu',
  phoneEncrypted: 'encrypted_phone',
  phoneHash: 'hash_abc123',
  email: null,
  isBlacklisted: false,
  blacklistedAt: null,
  lastReviewSentAt: null,
  externalId: null,
  source: 'manual',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  appointments: [],
  tenant: null as any,
  ...overrides,
});

const makeAppointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'appt-uuid-1',
  customerId: 'customer-uuid-1',
  locationId: 'location-uuid-1',
  externalId: 'mero-123',
  status: AppointmentStatus.COMPLETED,
  scheduledAt: new Date(),
  finishedAt: new Date(),
  serviceName: 'Tuns',
  staffName: 'Maria',
  reviewJobId: null,
  reviewSentAt: null,
  source: 'mero_webhook',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  customer: makeCustomer(),
  location: {
    id: 'location-uuid-1',
    tenantId: 'tenant-uuid-1',
    locationName: 'Salonul Maria',
  } as any,
  feedbackLog: null as any,
  ...overrides,
});

const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
  id: 'settings-uuid-1',
  tenantId: 'tenant-uuid-1',
  delayMinutes: 60,
  messageTemplate: 'Test {{feedback_url}}',
  spamFilterDays: 30,
  positiveScoreThreshold: 4,
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

// ─── Mock Queue ──────────────────────────────────────────────────────────────

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  getJob: jest.fn(),
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  getCompletedCount: jest.fn().mockResolvedValue(0),
  getFailedCount: jest.fn().mockResolvedValue(0),
  getDelayedCount: jest.fn().mockResolvedValue(0),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SchedulerService', () => {
  let service: SchedulerService;
  let appointmentRepo: jest.Mocked<Repository<Appointment>>;
  let feedbackLogRepo: jest.Mocked<Repository<FeedbackLog>>;
  let settingsRepo: jest.Mocked<Repository<Settings>>;
  let customerRepo: jest.Mocked<Repository<Customer>>;
  let customersService: jest.Mocked<CustomersService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: getQueueToken(REVIEW_QUEUE),
          useValue: mockQueue,
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FeedbackLog),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Settings),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: CustomersService,
          useValue: {
            isSpamFiltered: jest.fn(),
            markReviewSent: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: any) => {
              const config: Record<string, any> = {
                FEEDBACK_BASE_URL: 'https://reviewboost.ro/f',
              };
              return config[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
    appointmentRepo = module.get(getRepositoryToken(Appointment));
    feedbackLogRepo = module.get(getRepositoryToken(FeedbackLog));
    settingsRepo = module.get(getRepositoryToken(Settings));
    customerRepo = module.get(getRepositoryToken(Customer));
    customersService = module.get(CustomersService);

    jest.clearAllMocks();
  });

  // ─── scheduleReviewRequest ────────────────────────────────────────────────

  describe('scheduleReviewRequest', () => {
    it('should enqueue a job for a completed appointment', async () => {
      const appointment = makeAppointment();
      const settings = makeSettings();

      appointmentRepo.findOne.mockResolvedValue(appointment);
      settingsRepo.findOne.mockResolvedValue(settings);
      feedbackLogRepo.findOne.mockResolvedValue(null);
      feedbackLogRepo.create.mockImplementation((data) => data as FeedbackLog);
      feedbackLogRepo.save.mockResolvedValue({ id: 'fl-1', token: 'tok123' } as FeedbackLog);
      customersService.isSpamFiltered.mockResolvedValue(false);

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-review-request',
        expect.objectContaining({
          appointmentId: 'appt-uuid-1',
          customerId: 'customer-uuid-1',
          tenantId: 'tenant-uuid-1',
        }),
        expect.objectContaining({
          delay: 60 * 60 * 1000, // 60 minutes in ms
          jobId: 'review-appt-uuid-1',
        }),
      );
    });

    it('should NOT enqueue if appointment is not COMPLETED', async () => {
      const appointment = makeAppointment({ status: AppointmentStatus.PENDING });
      appointmentRepo.findOne.mockResolvedValue(appointment);

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should NOT enqueue if appointment already has a reviewJobId (idempotency)', async () => {
      const appointment = makeAppointment({ reviewJobId: 'existing-job-999' });
      appointmentRepo.findOne.mockResolvedValue(appointment);

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should NOT enqueue if customer is blacklisted', async () => {
      const appointment = makeAppointment({
        customer: makeCustomer({ isBlacklisted: true }),
      });
      const settings = makeSettings();

      appointmentRepo.findOne.mockResolvedValue(appointment);
      settingsRepo.findOne.mockResolvedValue(settings);
      feedbackLogRepo.findOne.mockResolvedValue(null);
      feedbackLogRepo.create.mockImplementation((data) => data as FeedbackLog);
      feedbackLogRepo.save.mockResolvedValue({ id: 'fl-1' } as FeedbackLog);

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should NOT enqueue if customer was messaged within spam filter window', async () => {
      const recentSendDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      const appointment = makeAppointment({
        customer: makeCustomer({ lastReviewSentAt: recentSendDate }),
      });
      const settings = makeSettings({ spamFilterDays: 30 });

      appointmentRepo.findOne.mockResolvedValue(appointment);
      settingsRepo.findOne.mockResolvedValue(settings);
      feedbackLogRepo.findOne.mockResolvedValue(null);
      feedbackLogRepo.create.mockImplementation((data) => data as FeedbackLog);
      feedbackLogRepo.save.mockResolvedValue({ id: 'fl-1' } as FeedbackLog);
      customersService.isSpamFiltered.mockResolvedValue(true); // Spam filtered!

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should enqueue if customer was messaged OUTSIDE spam filter window', async () => {
      const oldSendDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days ago
      const appointment = makeAppointment({
        customer: makeCustomer({ lastReviewSentAt: oldSendDate }),
      });
      const settings = makeSettings({ spamFilterDays: 30 });

      appointmentRepo.findOne.mockResolvedValue(appointment);
      settingsRepo.findOne.mockResolvedValue(settings);
      feedbackLogRepo.findOne.mockResolvedValue(null);
      feedbackLogRepo.create.mockImplementation((data) => data as FeedbackLog);
      feedbackLogRepo.save.mockResolvedValue({ id: 'fl-1', token: 'tok456' } as FeedbackLog);
      customersService.isSpamFiltered.mockResolvedValue(false); // Not filtered

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should use delay from tenant settings', async () => {
      const appointment = makeAppointment();
      const settings = makeSettings({ delayMinutes: 120 }); // 2 hours

      appointmentRepo.findOne.mockResolvedValue(appointment);
      settingsRepo.findOne.mockResolvedValue(settings);
      feedbackLogRepo.findOne.mockResolvedValue(null);
      feedbackLogRepo.create.mockImplementation((data) => data as FeedbackLog);
      feedbackLogRepo.save.mockResolvedValue({ id: 'fl-1', token: 'tok789' } as FeedbackLog);
      customersService.isSpamFiltered.mockResolvedValue(false);

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-review-request',
        expect.anything(),
        expect.objectContaining({ delay: 120 * 60 * 1000 }),
      );
    });

    it('should fall back to 60 minute delay when no settings exist', async () => {
      const appointment = makeAppointment();

      appointmentRepo.findOne.mockResolvedValue(appointment);
      settingsRepo.findOne.mockResolvedValue(null); // No settings
      feedbackLogRepo.findOne.mockResolvedValue(null);
      feedbackLogRepo.create.mockImplementation((data) => data as FeedbackLog);
      feedbackLogRepo.save.mockResolvedValue({ id: 'fl-1', token: 'tok000' } as FeedbackLog);
      customersService.isSpamFiltered.mockResolvedValue(false);

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-review-request',
        expect.anything(),
        expect.objectContaining({ delay: 60 * 60 * 1000 }),
      );
    });

    it('should return early if appointment not found', async () => {
      appointmentRepo.findOne.mockResolvedValue(null);

      await service.scheduleReviewRequest('non-existent-uuid');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should use unique jobId to prevent duplicate queue entries', async () => {
      const appointment = makeAppointment();
      const settings = makeSettings();

      appointmentRepo.findOne.mockResolvedValue(appointment);
      settingsRepo.findOne.mockResolvedValue(settings);
      feedbackLogRepo.findOne.mockResolvedValue(null);
      feedbackLogRepo.create.mockImplementation((data) => data as FeedbackLog);
      feedbackLogRepo.save.mockResolvedValue({ id: 'fl-1', token: 'tokdup' } as FeedbackLog);
      customersService.isSpamFiltered.mockResolvedValue(false);

      await service.scheduleReviewRequest('appt-uuid-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-review-request',
        expect.anything(),
        expect.objectContaining({
          jobId: `review-${appointment.id}`, // Deterministic job ID
        }),
      );
    });
  });

  // ─── getQueueStats ────────────────────────────────────────────────────────

  describe('getQueueStats', () => {
    it('should return all queue metrics', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(5);
      mockQueue.getActiveCount.mockResolvedValue(2);
      mockQueue.getCompletedCount.mockResolvedValue(100);
      mockQueue.getFailedCount.mockResolvedValue(3);
      mockQueue.getDelayedCount.mockResolvedValue(47);

      const stats = await service.getQueueStats();

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 47,
      });
    });
  });
});
