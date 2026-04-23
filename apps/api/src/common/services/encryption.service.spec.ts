import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test_encryption_key_32chars_exact!'),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a phone number correctly', () => {
      const phone = '+40721234567';
      const encrypted = service.encrypt(phone);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(phone);
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const phone = '+40721234567';
      const enc1 = service.encrypt(phone);
      const enc2 = service.encrypt(phone);
      expect(enc1).not.toBe(enc2);
    });

    it('should throw on tampered ciphertext', () => {
      const phone = '+40721234567';
      const encrypted = service.encrypt(phone);
      const tampered = encrypted.slice(0, -4) + 'XXXX'; // Corrupt auth tag
      expect(() => service.decrypt(tampered)).toThrow();
    });
  });

  describe('hash / hashPhone', () => {
    it('should produce consistent hashes for the same input', () => {
      expect(service.hash('hello')).toBe(service.hash('hello'));
    });

    it('should produce different hashes for different inputs', () => {
      expect(service.hash('hello')).not.toBe(service.hash('world'));
    });

    it('should normalize phone before hashing', () => {
      // Same phone, different formats → same hash
      const h1 = service.hashPhone('+40 721 234 567');
      const h2 = service.hashPhone('+40721234567');
      expect(h1).toBe(h2);
    });

    it('should produce 64-char hex hashes', () => {
      expect(service.hash('test')).toHaveLength(64);
    });
  });

  describe('normalizePhone', () => {
    it('should strip spaces and dashes', () => {
      expect(service.normalizePhone('+40 721-234-567')).toBe('+40721234567');
    });

    it('should preserve leading +', () => {
      expect(service.normalizePhone('+40721234567')).toBe('+40721234567');
    });
  });
});
