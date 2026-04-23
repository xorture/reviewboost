import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST', 'localhost'),
  port: configService.get<number>('DB_PORT', 5432),
  username: configService.get<string>('DB_USER', 'reviewboost'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_NAME', 'reviewboost'),
  ssl: configService.get<boolean>('DB_SSL', false) ? { rejectUnauthorized: false } : false,

  // Auto-load all entities from modules
  autoLoadEntities: true,

  // Run migrations automatically
  migrationsRun: configService.get('NODE_ENV') === 'production',
  migrations: [__dirname + '/../database/migrations/**/*.js'],
  migrationsTableName: 'migrations_history',

  // Only synchronize in development (NOT in production)
  synchronize: configService.get('NODE_ENV') === 'development',

  logging: configService.get('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],

  // Connection pooling for high load (1000 locations)
  extra: {
    max: 20,       // Max pool connections
    min: 5,        // Min pool connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
});
