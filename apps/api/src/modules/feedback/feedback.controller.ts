import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { IsInt, Min, Max, IsString, MaxLength } from 'class-validator';
import { FeedbackService } from './feedback.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';

class SubmitRatingDto {
  @IsInt() @Min(1) @Max(5)
  score: number;
}

class SubmitCommentDto {
  @IsString() @MaxLength(2000)
  comment: string;
}

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * GET /api/v1/feedback/:token
   * Public — returns page data for the star rating UI.
   */
  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Get feedback page data for a token' })
  @ApiParam({ name: 'token', description: 'Unique feedback token from WhatsApp link' })
  getFeedbackPage(@Param('token') token: string) {
    return this.feedbackService.getFeedbackPage(token);
  }

  /**
   * POST /api/v1/feedback/:token/rate
   * Public — user submits star rating.
   * Returns either { googleMapsUrl } for redirect or { showInternalForm: true }
   */
  @Public()
  @Post(':token/rate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit star rating (review gating logic)' })
  submitRating(@Param('token') token: string, @Body() dto: SubmitRatingDto) {
    return this.feedbackService.submitRating(token, dto.score);
  }

  /**
   * POST /api/v1/feedback/:token/comment
   * Public — user submits negative feedback comment.
   */
  @Public()
  @Post(':token/comment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit internal negative feedback comment' })
  submitComment(@Param('token') token: string, @Body() dto: SubmitCommentDto) {
    return this.feedbackService.submitNegativeComment(token, dto.comment);
  }

  // ─── Protected dashboard endpoints ───────────────────────────────────────

  @Get('dashboard/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get feedback statistics for tenant dashboard' })
  getStats(@CurrentTenant() tenant: Tenant) {
    return this.feedbackService.getStats(tenant.id);
  }

  @Get('dashboard/negative-feed')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get negative feedback feed for tenant dashboard' })
  getNegativeFeed(@CurrentTenant() tenant: Tenant) {
    return this.feedbackService.getNegativeFeed(tenant.id);
  }
}
