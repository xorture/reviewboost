import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../locations/location.entity';
import { PollingService } from '../scheduler/polling.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,

    private readonly pollingService: PollingService,
  ) {}

  async processMeroEvent(locationId: string, payload: any): Promise<void> {
    const event = payload.event as string;

    if (!event.startsWith('appointment.')) {
      this.logger.debug(`Ignoring Mero event: ${event}`);
      return;
    }

    const location = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!location) throw new NotFoundException('Location not found');

    const appt = payload.appointment;
    this.logger.log(`Mero webhook: ${event} for location ${locationId}, appt: ${appt.id}`);

    await this.pollingService.processExternalAppointment(
      {
        id: appt.id,
        clientPhone: appt.clientPhone,
        clientName: appt.clientName,
        clientEmail: appt.clientEmail,
        serviceId: '',
        serviceName: appt.serviceName,
        staffName: appt.staffName,
        status: appt.status === 'completed' ? 'completed' : appt.status,
        startTime: appt.startTime,
        endTime: appt.endTime,
      },
      location.tenantId,
      location,
      'mero_webhook',
    );
  }

  async processGenericEvent(locationId: string, payload: any): Promise<void> {
    const location = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!location) throw new NotFoundException('Location not found');

    await this.pollingService.processExternalAppointment(
      {
        id: payload.externalId,
        clientPhone: payload.clientPhone,
        clientName: payload.clientName ?? '',
        clientEmail: payload.clientEmail,
        serviceId: '',
        serviceName: payload.serviceName ?? '',
        staffName: payload.staffName,
        status: 'completed',
        startTime: payload.startTime,
        endTime: payload.endTime,
      },
      location.tenantId,
      location,
      'generic_webhook',
    );
  }

  async validateLocationApiKey(locationId: string, token: string): Promise<void> {
    const location = await this.locationRepo.findOne({
      where: { id: locationId },
      relations: ['tenant'],
    });

    if (!location) throw new NotFoundException('Location not found');

    // Compare with tenant's API key (stored in tenant record)
    const expectedKey = location.tenant?.id; // Simplified — use dedicated API keys in production
    if (!token || token !== expectedKey) {
      throw new UnauthorizedException('Invalid API key');
    }
  }
}
