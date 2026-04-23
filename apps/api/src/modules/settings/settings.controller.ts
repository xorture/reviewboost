import { Controller, Get, Patch, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService, UpdateSettingsDto } from './settings.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { IsString, MaxLength } from 'class-validator';

class PreviewTemplateDto {
  @IsString() @MaxLength(2000) template: string;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get tenant settings' })
  get(@CurrentTenant() tenant: Tenant) {
    return this.settingsService.get(tenant.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update tenant settings' })
  update(@CurrentTenant() tenant: Tenant, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(tenant.id, dto);
  }

  @Post('template/preview')
  @ApiOperation({ summary: 'Preview WhatsApp message template with sample data' })
  previewTemplate(@CurrentTenant() tenant: Tenant, @Body() dto: PreviewTemplateDto) {
    return this.settingsService.previewTemplate(tenant.id, dto.template);
  }
}
