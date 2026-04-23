import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IsString, IsOptional, IsUUID, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Location } from '../locations/location.entity';

export class CreateLocationDto {
  @ApiProperty() @IsString() @MaxLength(255) locationName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() googlePlaceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() googleReviewUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() googleMapsUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phoneNumber?: string;
}

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
  ) {}

  async create(tenantId: string, dto: CreateLocationDto): Promise<Location> {
    const location = this.locationRepo.create({ ...dto, tenantId });
    return this.locationRepo.save(location);
  }

  async findAll(tenantId: string): Promise<Location[]> {
    return this.locationRepo.find({
      where: { tenantId, isActive: true },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Location> {
    const loc = await this.locationRepo.findOne({ where: { id, tenantId } });
    if (!loc) throw new NotFoundException('Location not found');
    return loc;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateLocationDto>): Promise<Location> {
    const loc = await this.findOne(tenantId, id);
    Object.assign(loc, dto);
    return this.locationRepo.save(loc);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const loc = await this.findOne(tenantId, id);
    loc.isActive = false;
    await this.locationRepo.save(loc);
  }
}
