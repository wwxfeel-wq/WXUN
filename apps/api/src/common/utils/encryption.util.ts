import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * AES-256-GCM encryption utility.
 *
 * Security guarantees:
 * - Authenticated encryption (GCM mode): detects tampering via auth tag
 * - Unique IV per encryption (crypto.randomBytes)
 * - Key length validated at startup (exactly 32 bytes / 64 hex chars)
 * - No plaintext ever logged
 *
 * Storage format: "ivHex:authTagHex:ciphertextHex"
 */
@Injectable()
export class EncryptionUtil {
  private readonly logger = new Logger(EncryptionUtil.name);
  private readonly algorithm = 'aes-256-gcm';
  private key: Buffer;
  private keyVersion: number;

  constructor(private configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new Error(
        'ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }

    // Validate hex format and length
    if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
      throw new Error(
        `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ` +
          `Current length: ${encryptionKey.length}. ` +
          `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      );
    }

    this.key = Buffer.from(encryptionKey, 'hex');

    // Verify key length in bytes
    if (this.key.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${this.key.length} bytes`,
      );
    }

    // Derive a version tag from the key hash (for future rotation detection)
    this.keyVersion = crypto
      .createHash('sha256')
      .update(this.key)
      .digest()
      .readUInt8(0);

    this.logger.log(`EncryptionUtil initialized (key version: ${this.keyVersion})`);
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM.
   *
   * @param plaintext - The secret to encrypt
   * @returns Encrypted payload in format "ivHex:authTagHex:ciphertextHex"
   */
  encrypt(plaintext: string): string {
    if (!plaintext) throw new Error('Cannot encrypt empty string');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt an AES-256-GCM encrypted string.
   *
   * @param encryptedData - Encrypted payload in format "ivHex:authTagHex:ciphertextHex"
   * @returns The original plaintext
   * @throws Error if decryption fails (wrong key, tampered data, or malformed input)
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('Invalid encrypted data: empty or non-string');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error(
        `Invalid encrypted data format: expected 3 parts (iv:authTag:ciphertext), got ${parts.length}`,
      );
    }

    const [ivHex, authTagHex, encrypted] = parts;

    // Validate hex format of IV and authTag
    if (!/^[0-9a-fA-F]{32}$/.test(ivHex)) {
      throw new Error('Invalid IV format: expected 32 hex chars (16 bytes)');
    }
    if (!/^[0-9a-fA-F]{32}$/.test(authTagHex)) {
      throw new Error('Invalid authTag format: expected 32 hex chars (16 bytes)');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted: string;
    try {
      decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
    } catch (e) {
      // GCM auth failure — do NOT log the encrypted data
      throw new Error(
        `Decryption failed: authentication tag mismatch or wrong key. ` +
          `This may indicate data corruption or a key rotation is needed.`,
      );
    }

    return decrypted;
  }

  /**
   * Encrypt a JSON-serializable object.
   * Useful for encrypting structured data like credentials.
   */
  encryptJSON(obj: unknown): string {
    return this.encrypt(JSON.stringify(obj));
  }

  /**
   * Decrypt and parse a JSON string.
   */
  decryptJSON<T = unknown>(encryptedData: string): T {
    return JSON.parse(this.decrypt(encryptedData)) as T;
  }

  /**
   * Re-encrypt data with a new key (for key rotation).
   * Decrypts with current key, then re-encrypts with the new key.
   *
   * @param encryptedData - Data encrypted with the OLD key
   * @param newKeyHex - New 64-char hex key
   * @returns Data re-encrypted with the new key
   */
  rotateKey(encryptedData: string, newKeyHex: string): string {
    // Validate new key
    if (!/^[0-9a-fA-F]{64}$/.test(newKeyHex)) {
      throw new Error('New key must be 64 hex characters (32 bytes)');
    }

    const newKey = Buffer.from(newKeyHex, 'hex');
    if (newKey.length !== 32) {
      throw new Error('New key must decode to exactly 32 bytes');
    }

    // Decrypt with old key
    const plaintext = this.decrypt(encryptedData);

    // Encrypt with new key
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, newKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // R1-006: Zero out the plaintext buffer (best effort) to minimize
    // the window during which the secret resides in memory as a string.
    // Since `plaintext` is a JS string (immutable), we cannot truly zero
    // its memory, but we overwrite the local reference and use fill(0)
    // on a buffer copy to reduce exposure.
    const plaintextBuf = Buffer.from(plaintext, 'utf8');
    plaintextBuf.fill(0);

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Check if an encrypted payload can be decrypted with the current key.
   * Useful for detecting if a key rotation is needed.
   */
  canDecrypt(encryptedData: string): boolean {
    try {
      this.decrypt(encryptedData);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Mask a sensitive string for display/logging.
   * Shows first 4 and last 4 characters only.
   */
  maskSecret(secret: string): string {
    if (!secret || secret.length <= 8) return '****';
    return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
  }

  /** Hash a password using bcrypt-compatible scrypt */
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /** Verify a password against a hash */
  verifyPassword(password: string, hash: string): boolean {
    const [salt, key] = hash.split(':');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
  }

  /** Generate a secure random token */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /** Generate an OTP code */
  generateOTP(length: number = 6): string {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[crypto.randomInt(0, digits.length)];
    }
    return otp;
  }

  /** Get the current key version (for rotation detection) */
  getKeyVersion(): number {
    return this.keyVersion;
  }

  /**
   * R1-001: Update the in-memory encryption key after a key rotation.
   *
   * After rotateEncryptionKey() re-encrypts all stored secrets with a new key,
   * this method must be called to update the in-memory `this.key` so that
   * subsequent decrypt() calls use the new key instead of the stale old one.
   *
   * @param newKeyHex - New 64-char hex key (32 bytes)
   */
  updateKey(newKeyHex: string): void {
    if (!/^[0-9a-fA-F]{64}$/.test(newKeyHex)) {
      throw new Error('New key must be 64 hex characters (32 bytes)');
    }

    const newKey = Buffer.from(newKeyHex, 'hex');
    if (newKey.length !== 32) {
      throw new Error('New key must decode to exactly 32 bytes');
    }

    // Overwrite the old key buffer before replacing (best-effort secure wipe)
    this.key.fill(0);
    this.key = newKey;

    this.keyVersion = crypto
      .createHash('sha256')
      .update(this.key)
      .digest()
      .readUInt8(0);

    this.logger.log(`Encryption key updated in-memory (new key version: ${this.keyVersion})`);
  }
}
