import {
  Entity,
  Column,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { Appointment } from '../appointments/appointment.entity';

export enum FeedbackChannel {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
}

export enum FeedbackStatus {
  QUEUED = 'queued',       // In BullMQ queue, not yet sent
  SENT = 'sent',           // WhatsApp message delivered
  OPENED = 'opened',       // User clicked the link
  RATED = 'rated',         // User submitted a rating
  SKIPPED = 'skipped',     // Spam filter blocked it
  FAILED = 'failed',       // WhatsApp delivery failed
}

export enum FeedbackType {
  POSITIVE = 'positive',   // 4-5 stars → redirected to Google Maps
  NEGATIVE = 'negative',   // 1-3 stars → internal form
}

@Entity('feedback_logs')
@Index(['appointmentId'], { unique: true })
@Index(['tenantId'])
@Index(['sentAt'])
@Index(['feedbackType'])
export class FeedbackLog extends AppBaseEntity {
  @Column({ name: 'appointment_id' })
  appointmentId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  // The unique token in the feedback URL: reviewboost.ro/f/{token}
  @Column({ name: 'token', unique: true })
  token: string;

  @Column({
    type: 'enum',
    enum: FeedbackChannel,
    default: FeedbackChannel.WHATSAPP,
  })
  channel: FeedbackChannel;

  @Column({
    type: 'enum',
    enum: FeedbackStatus,
    default: FeedbackStatus.QUEUED,
  })
  status: FeedbackStatus;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date;

  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt: Date;

  @Column({ name: 'rated_at', type: 'timestamptz', nullable: true })
  ratedAt: Date;

  // Rating (1-5 stars). Null until user submits.
  @Column({ type: 'smallint', nullable: true })
  score: number;

  // Internal comment (only for negative reviews 1-3)
  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({
    name: 'feedback_type',
    type: 'enum',
    enum: FeedbackType,
    nullable: true,
  })
  feedbackType: FeedbackType;

  // True if negative alert was already sent to tenant
  @Column({ name: 'alert_sent', default: false })
  alertSent: boolean;

  // WhatsApp message SID (from Twilio/Meta)
  @Column({ name: 'whatsapp_message_id', nullable: true })
  whatsappMessageId: string;

  // Token expiration (48h from send)
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date;

  // Relations
  @OneToOne(() => Appointment, (appointment) => appointment.feedbackLog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Appointment;
}
