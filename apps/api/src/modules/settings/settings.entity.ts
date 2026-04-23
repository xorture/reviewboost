import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { Tenant } from '../tenants/tenant.entity';

@Entity('settings')
@Index(['tenantId'], { unique: true })
export class Settings extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  // Delay before sending WhatsApp message after appointment (in minutes)
  @Column({ name: 'delay_minutes', default: 60 })
  delayMinutes: number;

  // Custom WhatsApp message template
  // Supports variables: {{client_name}}, {{business_name}}, {{service}}, {{feedback_url}}
  @Column({ name: 'message_template', type: 'text' })
  messageTemplate: string;

  // Spam filter: don't send to same customer within X days
  @Column({ name: 'spam_filter_days', default: 30 })
  spamFilterDays: number;

  // Minimum score to redirect to Google Maps (default 4)
  @Column({ name: 'positive_score_threshold', default: 4 })
  positiveScoreThreshold: number;

  // Notification preferences for tenant owner
  @Column({ name: 'notify_negative_email', default: true })
  notifyNegativeEmail: boolean;

  @Column({ name: 'notify_negative_whatsapp', default: false })
  notifyNegativeWhatsapp: boolean;

  @Column({ name: 'notification_email', nullable: true })
  notificationEmail: string;

  @Column({ name: 'notification_phone', nullable: true })
  notificationPhone: string;

  // Feature flags
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // WhatsApp Business verified name to show in messages
  @Column({ name: 'whatsapp_display_name', nullable: true })
  whatsappDisplayName: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.settings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}

export const DEFAULT_MESSAGE_TEMPLATE = `Bună ziua, {{client_name}}! 👋

Îți mulțumim că ai ales *{{business_name}}*!

Cum a fost experiența ta astăzi? Feedback-ul tău ne ajută să ne îmbunătățim:

⭐ {{feedback_url}}

Îți mulțumim!
_Răspunde cu STOP pentru dezabonare_`;
