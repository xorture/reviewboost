import { IsString, IsOptional, IsEmail, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: '+40721234567', description: 'Phone number in E.164 format' })
  @IsString()
  @Matches(/^\+?\d{7,15}$/, { message: 'Invalid phone number format' })
  phoneNumber: string;

  @ApiPropertyOptional({ example: 'Ion Popescu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional({ example: 'ion@email.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'External ID from Mero or other platform' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ enum: ['manual', 'csv_import', 'webhook', 'api'], default: 'manual' })
  @IsOptional()
  @IsString()
  source?: string;
}

export class ImportCustomersDto {
  @ApiPropertyOptional({ description: 'CSV delimiter', default: ',' })
  @IsOptional()
  @IsString()
  delimiter?: string;
}
