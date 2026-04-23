import {
  IsString, IsOptional, IsUUID, IsDateString,
  IsBoolean, IsEmail, Matches, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty() @IsUUID() locationId: string;

  @ApiProperty({ example: '+40721234567' })
  @IsString() @Matches(/^\+?\d{7,15}$/) customerPhone: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() customerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) serviceName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) staffName?: string;

  @ApiProperty() @IsDateString() scheduledAt: Date;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean() markAsCompleted?: boolean;
}

export class CompleteAppointmentDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() finishedAt?: Date;
}
