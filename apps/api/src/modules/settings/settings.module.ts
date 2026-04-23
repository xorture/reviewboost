// ─── settings.module.ts ───────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settings } from './settings.entity';
import { Location } from '../locations/location.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { Tenant } from '../tenants/tenant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Settings, Location, Tenant])],
  providers: [SettingsService, LocationsService],
  controllers: [SettingsController, LocationsController],
  exports: [SettingsService],
})
export class SettingsModule {}
