import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { ReviewJobProcessor } from './processors/review-job.processor';
import { SchedulerController } from './scheduler.controller';
import { PollingService } from './polling.service';
import { Appointment } from '../appointments/appointment.entity';
import { FeedbackLog } from '../feedback/feedback-log.entity';
import { Customer } from '../customers/customer.entity';
import { Settings } from '../settings/settings.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CustomersModule } from '../customers/customers.module';

export const REVIEW_QUEUE = 'review-messages';

@Module({
  imports: [
    BullModule.registerQueue({ name: REVIEW_QUEUE }),
    TypeOrmModule.forFeature([Appointment, FeedbackLog, Customer, Settings]),
    WhatsAppModule,
    CustomersModule,
  ],
  providers: [SchedulerService, ReviewJobProcessor, PollingService],
  controllers: [SchedulerController],
  exports: [SchedulerService],
})
export class SchedulerModule {}
