import { Controller, Get, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SchedulerService } from './scheduler.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';

@ApiTags('scheduler')
@ApiBearerAuth()
@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get('queue/stats')
  @ApiOperation({ summary: 'Get BullMQ queue statistics' })
  getQueueStats() {
    return this.schedulerService.getQueueStats();
  }

  @Post('appointments/:id/schedule')
  @ApiOperation({ summary: 'Manually trigger review request for an appointment' })
  scheduleReview(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) appointmentId: string,
  ) {
    return this.schedulerService.scheduleReviewRequest(appointmentId);
  }
}
