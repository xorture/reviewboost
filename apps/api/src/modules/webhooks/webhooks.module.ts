import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { Location } from '../locations/location.entity';
import { Tenant } from '../tenants/tenant.entity';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Location, Tenant]),
    SchedulerModule,
    CustomersModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
