import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Salonul Maria' })
  @IsString()
  @MaxLength(255)
  businessName: string;

  @ApiProperty({ example: 'Maria Ionescu' })
  @IsString()
  @MaxLength(255)
  ownerName: string;

  @ApiProperty({ example: 'maria@salonulmaria.ro' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase, and one number',
  })
  password: string;

  @ApiPropertyOptional({ example: '+40721234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'Str. Florilor 10, Cluj-Napoca' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'RO12345678' })
  @IsOptional()
  @IsString()
  @MaxLength(13)
  cui?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'maria@salonulmaria.ro' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
