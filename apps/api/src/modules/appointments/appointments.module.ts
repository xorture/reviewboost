// ─── appointments.module.ts ───────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './appointment.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { CustomersModule } from '../customers/customers.module';
import { Location } from '../locations/location.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Location]),
    SchedulerModule,
    CustomersModule,
  ],
  providers: [AppointmentsService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
