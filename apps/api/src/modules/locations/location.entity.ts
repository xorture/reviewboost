import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Appointment } from '../appointments/appointment.entity';

@Entity('locations')
@Index(['tenantId'])
export class Location extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'location_name', length: 255 })
  locationName: string;

  @Column({ length: 500, nullable: true })
  address: string;

  @Column({ name: 'google_maps_url', nullable: true })
  googleMapsUrl: string;

  @Column({ name: 'google_place_id', nullable: true })
  googlePlaceId: string;

  // Override tenant-level Google review URL for this specific location
  @Column({ name: 'google_review_url', nullable: true })
  googleReviewUrl: string;

  @Column({ name: 'phone_number', length: 20, nullable: true })
  phoneNumber: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // External ID from Mero/Appointfix
  @Column({ name: 'external_id', nullable: true })
  externalId: string;

  // Relations
  @ManyToOne(() => Tenant, (tenant) => tenant.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @OneToMany(() => Appointment, (appointment) => appointment.location)
  appointments: Appointment[];
}
