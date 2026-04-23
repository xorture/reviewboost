import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { CustomersModule } from './modules/customers/customers.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SettingsModule } from './modules/settings/settings.module';
import { BillingModule } from './modules/billing/billing.module';

import { databaseConfig } from './config/database.config';
import { bullConfig } from './config/bull.config';
import { validationSchema } from './config/env.validation';

@Module({
  imports: [
    // Config - loads .env, validates schema
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema,
      cache: true,
    }),

    // Database - PostgreSQL with TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: databaseConfig,
      inject: [ConfigService],
    }),

    // Redis Queue - BullMQ for async job processing
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: bullConfig,
      inject: [ConfigService],
    }),

    // Cron jobs (polling service)
    ScheduleModule.forRoot(),

    // Event emitter for internal events
    EventEmitterModule.forRoot({ wildcard: true }),

    // Rate limiting - protect against abuse
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000,
            limit: configService.get<number>('THROTTLE_LIMIT', 30),
          },
        ],
      }),
    }),

    // Feature modules
    AuthModule,
    TenantsModule,
    CustomersModule,
    AppointmentsModule,
    FeedbackModule,
    WhatsAppModule,
    SchedulerModule,
    WebhooksModule,
    SettingsModule,
    BillingModule,
  ],
  providers: [
    // Global rate limit guard
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
