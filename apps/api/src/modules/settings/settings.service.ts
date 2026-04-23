// ─── settings.service.ts ─────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings } from './settings.entity';
import { IsInt, IsString, IsBoolean, IsEmail, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ minimum: 5, maximum: 1440 })
  @IsOptional() @IsInt() @Min(5) @Max(1440) delayMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000) messageTemplate?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional() @IsInt() @Min(1) @Max(365) spamFilterDays?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5) positiveScoreThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() notifyNegativeEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() notifyNegativeWhatsapp?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsEmail() notificationEmail?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() notificationPhone?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() whatsappDisplayName?: string;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
  ) {}

  async get(tenantId: string): Promise<Settings> {
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings) throw new NotFoundException('Settings not found');
    return settings;
  }

  async update(tenantId: string, dto: UpdateSettingsDto): Promise<Settings> {
    const settings = await this.get(tenantId);
    Object.assign(settings, dto);
    return this.settingsRepo.save(settings);
  }

  async previewTemplate(tenantId: string, template: string): Promise<{ preview: string }> {
    const preview = template
      .replace('{{client_name}}', 'Ion Popescu')
      .replace('{{business_name}}', 'Salonul Tău')
      .replace('{{service}}', 'Tuns')
      .replace('{{feedback_url}}', 'https://reviewboost.ro/f/abc123xyz');
    return { preview };
  }
}
