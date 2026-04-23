import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, ImportCustomersDto } from './dto/create-customer.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a single customer' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(tenant.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all customers (paginated)' })
  findAll(
    @CurrentTenant() tenant: Tenant,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    return this.customersService.findAll(tenant.id, page, Math.min(limit, 100));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  findOne(@CurrentTenant() tenant: Tenant, @Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findById(tenant.id, id);
  }

  @Post('import/csv')
  @ApiOperation({ summary: 'Bulk import customers from CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        delimiter: { type: 'string', default: ',' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @CurrentTenant() tenant: Tenant,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportCustomersDto,
  ) {
    return this.customersService.importFromCsv(tenant.id, file.buffer, dto.delimiter);
  }

  @Delete(':id/gdpr-erase')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'GDPR: Erase all personal data for a customer' })
  async gdprErase(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.customersService.gdprErase(tenant.id, id);
  }
}
