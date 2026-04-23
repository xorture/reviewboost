import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { TenantsService } from './tenants.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Tenant } from './tenant.entity';

class UpdateTenantDto {
  @IsOptional() @IsString() @MaxLength(255) businessName?: string;
  @IsOptional() @IsString() @MaxLength(255) ownerName?: string;
  @IsOptional() @IsString() googlePlaceId?: string;
  @IsOptional() @IsString() googleMapsReviewUrl?: string;
  @IsOptional() @IsString() @MaxLength(20) phoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own tenant profile' })
  getProfile(@CurrentTenant() tenant: Tenant) {
    return this.tenantsService.getProfile(tenant.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own tenant profile' })
  update(@CurrentTenant() tenant: Tenant, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(tenant.id, dto);
  }
}
