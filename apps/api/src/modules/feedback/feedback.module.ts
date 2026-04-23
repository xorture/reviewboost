import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackLog } from './feedback-log.entity';
import { Appointment } from '../appointments/appointment.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { Settings } from '../settings/settings.entity';
import { AlertService } from './alert.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeedbackLog, Appointment, Tenant, Location, Settings]),
  ],
  providers: [FeedbackService, AlertService],
  controllers: [FeedbackController],
  exports: [FeedbackService],
})
export class FeedbackModule {}
