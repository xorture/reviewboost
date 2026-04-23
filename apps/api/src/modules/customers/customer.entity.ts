import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
  AfterLoad,
} from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Appointment } from '../appointments/appointment.entity';
import { EncryptionService } from '../../common/services/encryption.service';

/**
 * Customer - End user who receives WhatsApp review requests.
 *
 * GDPR Compliance:
 * - phone_number is AES-256 encrypted at application level before DB write
 * - phone_hash is a SHA-256 hash used for deduplication queries (can't reverse to phone)
 * - Full delete available via GDPR erasure endpoint
 */
@Entity('customers')
@Index(['tenantId', 'phoneHash'], { unique: true }) // One customer per phone per tenant
@Index(['tenantId'])
export class Customer extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'full_name', length: 255, nullable: true })
  fullName: string;

  /**
   * AES-256 encrypted phone number (GDPR).
   * Never query this column directly — use phoneHash for lookups.
   */
  @Column({ name: 'phone_encrypted', type: 'text' })
  phoneEncrypted: string;

  /**
   * SHA-256 HMAC hash of the phone number.
   * Used for deduplication and spam filter queries.
   * Cannot be reversed to the original phone number.
   */
  @Column({ name: 'phone_hash', length: 64 })
  phoneHash: string;

  @Column({ length: 255, nullable: true })
  email: string;

  // GDPR opt-out (responded with STOP)
  @Column({ name: 'is_blacklisted', default: false })
  isBlacklisted: boolean;

  @Column({ name: 'blacklisted_at', type: 'timestamptz', nullable: true })
  blacklistedAt: Date;

  // Spam filter: track last message sent timestamp
  @Column({ name: 'last_review_sent_at', type: 'timestamptz', nullable: true })
  lastReviewSentAt: Date;

  // External ID from Mero / other platforms
  @Column({ name: 'external_id', nullable: true })
  externalId: string;

  // Source: 'csv_import' | 'webhook' | 'manual' | 'api'
  @Column({ name: 'source', length: 50, default: 'manual' })
  source: string;

  // Transient property - populated after load, never stored
  phoneNumber?: string;

  // Relations
  @ManyToOne(() => Tenant, (tenant) => tenant.customers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @OneToMany(() => Appointment, (appointment) => appointment.customer)
  appointments: Appointment[];
}
