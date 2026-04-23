import {
  Entity,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { Customer } from '../customers/customer.entity';
import { Location } from '../locations/location.entity';
import { FeedbackLog } from '../feedback/feedback-log.entity';

export enum AppointmentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELED = 'canceled',
  NO_SHOW = 'no_show',
}

@Entity('appointments')
@Index(['customerId'])
@Index(['locationId'])
@Index(['status'])
@Index(['externalId', 'locationId'], { unique: true, where: '"external_id" IS NOT NULL' })
export class Appointment extends AppBaseEntity {
  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ name: 'location_id' })
  locationId: string;

  // ID from external platform (Mero, Appointfix, etc.)
  @Column({ name: 'external_id', nullable: true })
  externalId: string;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.PENDING,
  })
  status: AppointmentStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date;

  // Service info (optional, for display in dashboard)
  @Column({ name: 'service_name', nullable: true })
  serviceName: string;

  @Column({ name: 'staff_name', nullable: true })
  staffName: string;

  // WhatsApp job tracking
  @Column({ name: 'review_job_id', nullable: true })
  reviewJobId: string;

  @Column({ name: 'review_sent_at', type: 'timestamptz', nullable: true })
  reviewSentAt: Date;

  // Source: 'mero_webhook' | 'mero_polling' | 'csv_import' | 'manual'
  @Column({ name: 'source', length: 50, default: 'manual' })
  source: string;

  // Relations
  @ManyToOne(() => Customer, (customer) => customer.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => Location, (location) => location.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @OneToOne(() => FeedbackLog, (feedback) => feedback.appointment)
  feedbackLog: FeedbackLog;
}
