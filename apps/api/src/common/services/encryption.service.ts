import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * EncryptionService
 *
 * Provides AES-256-GCM encryption for sensitive data (phone numbers - GDPR).
 * Uses authenticated encryption to detect tampering.
 *
 * AES-256-GCM:
 * - 256-bit key (32 bytes)
 * - 96-bit IV (12 bytes) - random per encryption
 * - 128-bit auth tag - prevents tampering
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12;
  private readonly TAG_LENGTH = 16;

  constructor(private readonly configService: ConfigService) {
    const keyString = this.configService.get<string>('ENCRYPTION_KEY');
    if (!keyString || keyString.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
    }
    this.key = Buffer.from(keyString, 'utf8');
  }

  /**
   * Encrypt plaintext → base64 string (IV + ciphertext + authTag)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: iv(12) + authTag(16) + ciphertext → base64
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  /**
   * Decrypt base64 string → plaintext
   */
  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, 'base64');

    const iv = buf.subarray(0, this.IV_LENGTH);
    const authTag = buf.subarray(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH);
    const encrypted = buf.subarray(this.IV_LENGTH + this.TAG_LENGTH);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * One-way HMAC-SHA256 hash — used for phone number deduplication.
   * Cannot be reversed. Safe to store and query.
   */
  hash(value: string): string {
    return crypto
      .createHmac('sha256', this.key)
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  /**
   * Normalize a phone number to E.164 format for consistent hashing.
   * "+40 721 234 567" → "+40721234567"
   */
  normalizePhone(phone: string): string {
    // Strip all non-digit chars except leading +
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Hash a phone number (normalize first for consistency).
   */
  hashPhone(phone: string): string {
    return this.hash(this.normalizePhone(phone));
  }
}
