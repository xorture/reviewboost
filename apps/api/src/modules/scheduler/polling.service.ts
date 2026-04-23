import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Tenant, SubscriptionStatus } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { Customer } from '../customers/customer.entity';
import { Appointment, AppointmentStatus } from '../appointments/appointment.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
import { SchedulerService } from '../scheduler.service';
import { CustomersService } from '../../customers/customers.service';
import { nanoid } from 'nanoid';

interface MeroAppointment {
  id: string;
  clientPhone: string;
  clientName: string;
  clientEmail?: string;
  serviceId: string;
  serviceName: string;
  staffName?: string;
  status: string;
  startTime: string;
  endTime?: string;
}

@Injectable()
export class PollingService {
  private readonly logger = new Logger(PollingService.name);
  private isRunning = false;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,

    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    private readonly schedulerService: SchedulerService,
    private readonly customersService: CustomersService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Poll Mero API every 15 minutes for completed appointments.
   * Only runs for tenants with active subscriptions that have externalId set.
   */
  @Cron(CronExpression.EVERY_15_MINUTES)
  async pollMeroAppointments(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Polling already in progress — skipping this cycle');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting Mero polling cycle...');

    try {
      // Only poll for active tenants
      const activeTenants = await this.tenantRepo.find({
        where: [
          { subscriptionStatus: SubscriptionStatus.ACTIVE },
          { subscriptionStatus: SubscriptionStatus.TRIAL },
        ],
        relations: ['locations'],
      });

      let totalProcessed = 0;

      for (const tenant of activeTenants) {
        const locationsWithExternalId = tenant.locations?.filter(
          (loc) => loc.externalId && loc.isActive,
        );

        if (!locationsWithExternalId?.length) continue;

        for (const location of locationsWithExternalId) {
          try {
            const count = await this.pollLocationAppointments(tenant, location);
            totalProcessed += count;
          } catch (err) {
            this.logger.error(
              `Polling failed for location ${location.id}: ${(err as Error).message}`,
            );
          }
        }
      }

      this.logger.log(`Polling cycle complete — processed ${totalProcessed} new appointments`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Poll a single location's completed appointments from Mero API.
   * Fetches appointments from the last 2 hours (overlapping window for safety).
   */
  private async pollLocationAppointments(tenant: Tenant, location: Location): Promise<number> {
    const meroBaseUrl = this.configService.get<string>('MERO_API_BASE_URL');

    // 2-hour window (polling every 15min, 2h window ensures no gaps)
    const from = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();

    const response = await axios.get<{ appointments: MeroAppointment[] }>(
      `${meroBaseUrl}/locations/${location.externalId}/appointments`,
      {
        params: { from, to, status: 'completed' },
        headers: { Authorization: `Bearer ${tenant.id}` }, // TODO: per-tenant API key
        timeout: 10000,
      },
    );

    const appointments = response.data?.appointments ?? [];
    let count = 0;

    for (const meroAppt of appointments) {
      const wasNew = await this.processExternalAppointment(
        meroAppt,
        tenant.id,
        location,
        'mero_polling',
      );
      if (wasNew) count++;
    }

    return count;
  }

  /**
   * Process a single appointment from an external source (polling or webhook).
   * Idempotent — if externalId already exists, skip.
   * Returns true if new appointment was created.
   */
  async processExternalAppointment(
    externalAppt: MeroAppointment,
    tenantId: string,
    location: Location,
    source: string,
  ): Promise<boolean> {
    // Idempotency: check if we've already processed this appointment
    const existing = await this.appointmentRepo.findOne({
      where: { externalId: externalAppt.id, locationId: location.id },
    });

    if (existing) {
      // If it was pending and now completed, update and schedule
      if (
        existing.status === AppointmentStatus.PENDING &&
        externalAppt.status === 'completed'
      ) {
        await this.appointmentRepo.update(existing.id, {
          status: AppointmentStatus.COMPLETED,
          finishedAt: externalAppt.endTime ? new Date(externalAppt.endTime) : new Date(),
        });
        await this.schedulerService.scheduleReviewRequest(existing.id);
        return true;
      }
      return false;
    }

    // Upsert customer
    const customer = await this.customersService.create(tenantId, {
      phoneNumber: externalAppt.clientPhone,
      fullName: externalAppt.clientName,
      email: externalAppt.clientEmail,
      externalId: externalAppt.id,
      source,
    });

    // Create appointment
    const isCompleted = externalAppt.status === 'completed';
    const appointment = await this.appointmentRepo.save(
      this.appointmentRepo.create({
        customerId: customer.id,
        locationId: location.id,
        externalId: externalAppt.id,
        status: isCompleted ? AppointmentStatus.COMPLETED : AppointmentStatus.PENDING,
        scheduledAt: new Date(externalAppt.startTime),
        finishedAt: externalAppt.endTime ? new Date(externalAppt.endTime) : undefined,
        serviceName: externalAppt.serviceName,
        staffName: externalAppt.staffName,
        source,
      }),
    );

    // Schedule WhatsApp only for completed appointments
    if (isCompleted) {
      await this.schedulerService.scheduleReviewRequest(appointment.id);
    }

    return true;
  }
}
