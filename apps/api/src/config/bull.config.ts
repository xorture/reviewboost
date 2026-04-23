import { ConfigService } from '@nestjs/config';
import { SharedBullConfigurationFactory } from '@nestjs/bullmq';

export const bullConfig = (configService: ConfigService): SharedBullConfigurationFactory['createSharedConfiguration'] => ({
  connection: {
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: configService.get<number>('REDIS_PORT', 6379),
    password: configService.get<string>('REDIS_PASSWORD'),
    // Retry strategy for resilience
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3,
  },
  defaultJobOptions: {
    removeOnComplete: 100,   // Keep last 100 completed jobs
    removeOnFail: 500,       // Keep last 500 failed for debugging
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
