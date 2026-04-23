import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from './appointment.entity';
import { Location } from '../locations/location.entity';
import { CustomersService } from '../customers/customers.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,

    private readonly customersService: CustomersService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async create(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    // Validate location belongs to tenant
    const location = await this.locationRepo.findOne({
      where: { id: dto.locationId, tenantId },
    });
    if (!location) throw new NotFoundException('Location not found');

    // Upsert customer
    const customer = await this.customersService.create(tenantId, {
      phoneNumber: dto.customerPhone,
      fullName: dto.customerName,
      email: dto.customerEmail,
      source: 'manual',
    });

    const appointment = await this.appointmentRepo.save(
      this.appointmentRepo.create({
        customerId: customer.id,
        locationId: dto.locationId,
        externalId: dto.externalId,
        status: AppointmentStatus.PENDING,
        scheduledAt: dto.scheduledAt,
        serviceName: dto.serviceName,
        staffName: dto.staffName,
        source: 'manual',
      }),
    );

    // Auto-complete if requested
    if (dto.markAsCompleted) {
      return this.complete(tenantId, appointment.id, {
        finishedAt: dto.scheduledAt,
      });
    }

    return appointment;
  }

  async complete(
    tenantId: string,
    appointmentId: string,
    dto: CompleteAppointmentDto,
  ): Promise<Appointment> {
    const appointment = await this.findOne(tenantId, appointmentId);

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Appointment is already completed');
    }

    if (appointment.status === AppointmentStatus.CANCELED) {
      throw new BadRequestException('Cannot complete a canceled appointment');
    }

    await this.appointmentRepo.update(appointment.id, {
      status: AppointmentStatus.COMPLETED,
      finishedAt: dto.finishedAt ?? new Date(),
    });

    // Schedule WhatsApp review request
    await this.schedulerService.scheduleReviewRequest(appointment.id);

    return this.findOne(tenantId, appointmentId);
  }

  async findOne(tenantId: string, id: string): Promise<Appointment> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id },
      relations: ['customer', 'location', 'feedbackLog'],
    });

    if (!appointment || appointment.location?.tenantId !== tenantId) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async findAll(
    tenantId: string,
    locationId?: string,
    page = 1,
    limit = 50,
  ) {
    const qb = this.appointmentRepo
      .createQueryBuilder('a')
      .innerJoin('a.location', 'loc', 'loc.tenant_id = :tenantId', { tenantId })
      .leftJoinAndSelect('a.customer', 'customer')
      .leftJoinAndSelect('a.feedbackLog', 'feedbackLog')
      .orderBy('a.scheduled_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (locationId) qb.andWhere('a.location_id = :locationId', { locationId });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
