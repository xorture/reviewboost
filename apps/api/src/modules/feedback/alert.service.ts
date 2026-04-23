import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Tenant } from '../tenants/tenant.entity';
import { Settings } from '../settings/settings.entity';
import { FeedbackLog } from './feedback-log.entity';
import { Appointment } from '../appointments/appointment.entity';

interface NegativeAlertOptions {
  tenantId: string;
  feedbackLogId: string;
  score: number;
  appointmentId: string;
}

interface UpdateAlertOptions {
  tenantId: string;
  feedbackLogId: string;
  score: number;
  comment: string;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,

    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,

    @InjectRepository(FeedbackLog)
    private readonly feedbackLogRepo: Repository<FeedbackLog>,

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: configService.get<string>('SMTP_HOST'),
      port: configService.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: configService.get<string>('SMTP_USER'),
        pass: configService.get<string>('SMTP_PASS'),
      },
    });
  }

  /**
   * Send immediate negative review alert to tenant owner.
   * Called synchronously after a 1-3 star rating is submitted.
   */
  async sendNegativeAlert(options: NegativeAlertOptions): Promise<void> {
    const { tenantId, feedbackLogId, score, appointmentId } = options;

    const [tenant, settings, appointment] = await Promise.all([
      this.tenantRepo.findOne({ where: { id: tenantId } }),
      this.settingsRepo.findOne({ where: { tenantId } }),
      this.appointmentRepo.findOne({
        where: { id: appointmentId },
        relations: ['customer', 'location'],
      }),
    ]);

    if (!tenant || !settings) return;

    const stars = '⭐'.repeat(score) + '☆'.repeat(5 - score);
    const customerName = appointment?.customer?.fullName ?? 'Client anonim';
    const locationName = appointment?.location?.locationName ?? tenant.businessName;
    const serviceName = appointment?.serviceName ?? '';
    const dashboardUrl = `${this.configService.get('FRONTEND_URL')}/dashboard/feedback`;

    // Send email alert
    if (settings.notifyNegativeEmail) {
      const emailTo = settings.notificationEmail ?? tenant.email;

      try {
        await this.transporter.sendMail({
          from: `ReviewBoost <${this.configService.get('EMAIL_FROM')}>`,
          to: emailTo,
          subject: `⚠️ Feedback negativ ${stars} — ${locationName}`,
          html: this.buildNegativeEmailHtml({
            stars,
            score,
            customerName,
            locationName,
            serviceName,
            businessName: tenant.businessName,
            dashboardUrl,
          }),
        });

        this.logger.log(`Negative alert email sent to ${emailTo} (score: ${score}/5)`);
      } catch (err) {
        this.logger.error(`Failed to send negative alert email: ${(err as Error).message}`);
      }
    }

    // Mark alert as sent
    await this.feedbackLogRepo.update(feedbackLogId, { alertSent: true });
  }

  async updateAlertWithComment(options: UpdateAlertOptions): Promise<void> {
    const { tenantId, score, comment } = options;

    const [tenant, settings] = await Promise.all([
      this.tenantRepo.findOne({ where: { id: tenantId } }),
      this.settingsRepo.findOne({ where: { tenantId } }),
    ]);

    if (!tenant || !settings?.notifyNegativeEmail) return;

    const emailTo = settings.notificationEmail ?? tenant.email;
    const stars = '⭐'.repeat(score) + '☆'.repeat(5 - score);

    try {
      await this.transporter.sendMail({
        from: `ReviewBoost <${this.configService.get('EMAIL_FROM')}>`,
        to: emailTo,
        subject: `💬 Clientul a lăsat un comentariu ${stars} — ${tenant.businessName}`,
        html: this.buildCommentEmailHtml({ stars, score, comment, businessName: tenant.businessName }),
      });
    } catch (err) {
      this.logger.error(`Failed to send comment alert: ${(err as Error).message}`);
    }
  }

  private buildNegativeEmailHtml(data: {
    stars: string;
    score: number;
    customerName: string;
    locationName: string;
    serviceName: string;
    businessName: string;
    dashboardUrl: string;
  }): string {
    return `
<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    <!-- Header -->
    <div style="background:#dc2626;padding:24px 32px;">
      <p style="margin:0;color:#fff;font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">ReviewBoost Alert</p>
      <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">⚠️ Feedback Negativ Primit</h1>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">${data.stars}</div>
        <div style="font-size:40px;font-weight:800;color:#dc2626;">${data.score}/5</div>
        <div style="color:#6b7280;font-size:14px;">stele acordate</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;width:40%;">Client</td>
          <td style="padding:10px 0;font-weight:600;font-size:14px;border-bottom:1px solid #f3f4f6;">${data.customerName}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Locație</td>
          <td style="padding:10px 0;font-weight:600;font-size:14px;border-bottom:1px solid #f3f4f6;">${data.locationName}</td>
        </tr>
        ${data.serviceName ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">Serviciu</td><td style="padding:10px 0;font-weight:600;font-size:14px;">${data.serviceName}</td></tr>` : ''}
      </table>

      <p style="color:#374151;font-size:15px;line-height:1.6;">
        Clientul va lăsa un comentariu detaliat în formular. Poți vedea toate feedback-urile negative în dashboard-ul tău.
      </p>

      <div style="text-align:center;margin-top:28px;">
        <a href="${data.dashboardUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
          Vezi în Dashboard →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        ReviewBoost • Sistem automat de colectare recenzii<br>
        <a href="#" style="color:#6b7280;">Dezactivează alertele</a>
      </p>
    </div>
  </div>
</body>
</html>`;
  }

  private buildCommentEmailHtml(data: {
    stars: string;
    score: number;
    comment: string;
    businessName: string;
  }): string {
    return `
<!DOCTYPE html>
<html lang="ro">
<body style="font-family:system-ui,sans-serif;background:#f4f4f5;padding:32px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <h2 style="color:#374151;">💬 Comentariu feedback negativ ${data.stars}</h2>
    <div style="background:#f9fafb;border-left:4px solid #dc2626;padding:16px;border-radius:4px;margin:20px 0;">
      <p style="margin:0;color:#374151;font-style:italic;">"${data.comment}"</p>
    </div>
    <p style="color:#6b7280;font-size:14px;">Acest mesaj a fost trimis automat de ReviewBoost pentru ${data.businessName}.</p>
  </div>
</body>
</html>`;
  }
}
