import {
  Controller, Get, Post, Patch, Body, Param,
  Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, CompleteAppointmentDto } from './dto/create-appointment.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create appointment (and optionally mark as completed)' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(tenant.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List appointments' })
  findAll(
    @CurrentTenant() tenant: Tenant,
    @Query('locationId') locationId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    return this.appointmentsService.findAll(tenant.id, locationId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  findOne(@CurrentTenant() tenant: Tenant, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.findOne(tenant.id, id);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark appointment as completed → triggers WhatsApp review request' })
  complete(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteAppointmentDto,
  ) {
    return this.appointmentsService.complete(tenant.id, id, dto);
  }
}
