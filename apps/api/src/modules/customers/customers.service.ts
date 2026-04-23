import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { parse as csvParse } from 'csv-parse/sync';
import { Customer } from './customer.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';

export interface CustomerWithPhone extends Customer {
  phoneNumber: string;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Create a single customer.
   * Phone is encrypted + hashed before storage.
   * If customer with same phone exists in this tenant → return existing (upsert).
   */
  async create(tenantId: string, dto: CreateCustomerDto): Promise<CustomerWithPhone> {
    const normalizedPhone = this.encryptionService.normalizePhone(dto.phoneNumber);
    const phoneHash = this.encryptionService.hashPhone(normalizedPhone);

    // Check if already exists for this tenant
    const existing = await this.customerRepo.findOne({
      where: { tenantId, phoneHash },
    });

    if (existing) {
      // Update name if provided and different
      if (dto.fullName && existing.fullName !== dto.fullName) {
        existing.fullName = dto.fullName;
        await this.customerRepo.save(existing);
      }
      return this.withPhone(existing);
    }

    const customer = this.customerRepo.create({
      tenantId,
      fullName: dto.fullName,
      phoneEncrypted: this.encryptionService.encrypt(normalizedPhone),
      phoneHash,
      email: dto.email,
      externalId: dto.externalId,
      source: dto.source ?? 'manual',
    });

    const saved = await this.customerRepo.save(customer);
    return this.withPhone(saved);
  }

  /**
   * Bulk import from CSV/Excel buffer.
   * Expected columns: phone, name (optional), email (optional)
   * Returns { created, updated, skipped, errors }
   */
  async importFromCsv(
    tenantId: string,
    fileBuffer: Buffer,
    delimiter: string = ',',
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const stats = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    let records: Record<string, string>[];
    try {
      records = csvParse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter,
      }) as Record<string, string>[];
    } catch (err) {
      throw new Error(`Invalid CSV format: ${(err as Error).message}`);
    }

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const phone = row['phone'] || row['telefon'] || row['Phone'] || row['Telefon'];

      if (!phone) {
        stats.errors.push(`Row ${i + 2}: missing phone number`);
        stats.skipped++;
        continue;
      }

      try {
        const normalizedPhone = this.encryptionService.normalizePhone(phone);
        if (!normalizedPhone.match(/^\+?\d{7,15}$/)) {
          stats.errors.push(`Row ${i + 2}: invalid phone number "${phone}"`);
          stats.skipped++;
          continue;
        }

        const phoneHash = this.encryptionService.hashPhone(normalizedPhone);
        const existing = await this.customerRepo.findOne({ where: { tenantId, phoneHash } });

        if (existing) {
          stats.updated++;
          continue;
        }

        await this.customerRepo.save(
          this.customerRepo.create({
            tenantId,
            fullName: row['name'] || row['nume'] || row['Name'] || row['Nume'] || null,
            email: row['email'] || row['Email'] || null,
            phoneEncrypted: this.encryptionService.encrypt(normalizedPhone),
            phoneHash,
            source: 'csv_import',
          }),
        );
        stats.created++;
      } catch (err) {
        stats.errors.push(`Row ${i + 2}: ${(err as Error).message}`);
        stats.skipped++;
      }
    }

    this.logger.log(
      `CSV import for tenant ${tenantId}: +${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped`,
    );

    return stats;
  }

  /**
   * Find customer by phone hash (for deduplication — never by encrypted value).
   */
  async findByPhone(tenantId: string, phone: string): Promise<CustomerWithPhone | null> {
    const phoneHash = this.encryptionService.hashPhone(phone);
    const customer = await this.customerRepo.findOne({ where: { tenantId, phoneHash } });
    return customer ? this.withPhone(customer) : null;
  }

  /**
   * Find by ID, scoped to tenant (multi-tenant isolation).
   */
  async findById(tenantId: string, id: string): Promise<CustomerWithPhone> {
    const customer = await this.customerRepo.findOne({ where: { id, tenantId } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.withPhone(customer);
  }

  /**
   * List customers for a tenant (paginated).
   */
  async findAll(
    tenantId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ data: Customer[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.customerRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /**
   * Mark customer as blacklisted (responded with STOP to WhatsApp).
   */
  async blacklist(tenantId: string, phoneHash: string): Promise<void> {
    const customer = await this.customerRepo.findOne({ where: { tenantId, phoneHash } });
    if (!customer) return; // Silently ignore — customer may not exist yet

    customer.isBlacklisted = true;
    customer.blacklistedAt = new Date();
    await this.customerRepo.save(customer);

    this.logger.log(`Customer blacklisted: ${customer.id} (tenant: ${tenantId})`);
  }

  /**
   * Update lastReviewSentAt after successful WhatsApp send.
   */
  async markReviewSent(customerId: string): Promise<void> {
    await this.customerRepo.update(customerId, { lastReviewSentAt: new Date() });
  }

  /**
   * GDPR: Erase all personal data for a customer.
   * Replaces phone with irreversible placeholder, nulls name/email.
   */
  async gdprErase(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.customerRepo.findOne({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException('Customer not found');

    // Replace with anonymized placeholder
    customer.phoneEncrypted = this.encryptionService.encrypt(`ERASED_${customer.id}`);
    customer.phoneHash = `erased_${customer.id}`;
    customer.fullName = null;
    customer.email = null;
    customer.isBlacklisted = true;

    await this.customerRepo.save(customer);
    this.logger.log(`GDPR erasure completed for customer ${customerId}`);
  }

  /**
   * Spam filter check: has this customer received a message in the last X days?
   */
  async isSpamFiltered(customer: Customer, spamFilterDays: number): Promise<boolean> {
    if (!customer.lastReviewSentAt) return false;

    const daysSinceLastSend = Math.floor(
      (Date.now() - customer.lastReviewSentAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return daysSinceLastSend < spamFilterDays;
  }

  /**
   * Decrypt and attach phoneNumber to customer object (transient field).
   */
  private withPhone(customer: Customer): CustomerWithPhone {
    try {
      const phoneNumber = this.encryptionService.decrypt(customer.phoneEncrypted);
      return Object.assign(customer, { phoneNumber });
    } catch {
      return Object.assign(customer, { phoneNumber: '[decryption error]' });
    }
  }
}
