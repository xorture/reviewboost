import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LocationsService, CreateLocationDto } from './locations.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';

@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a location' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateLocationDto) {
    return this.locationsService.create(tenant.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all locations for tenant' })
  findAll(@CurrentTenant() tenant: Tenant) {
    return this.locationsService.findAll(tenant.id);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenant: Tenant, @Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.findOne(tenant.id, id);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateLocationDto>,
  ) {
    return this.locationsService.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: Tenant, @Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.remove(tenant.id, id);
  }
}
