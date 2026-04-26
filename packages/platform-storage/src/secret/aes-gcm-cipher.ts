import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedSecret, SecretCipher } from '@rntme-cli/platform-core';

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class AesGcmSecretCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor(keyHex: string, private readonly keyVersion = 1) {
    if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
      throw new Error('PLATFORM_SECRET_ENCRYPTION_KEY must be 32 bytes hex');
    }
    const key = Buffer.from(keyHex, 'hex');
    if (key.byteLength !== KEY_BYTES) {
      throw new Error('PLATFORM_SECRET_ENCRYPTION_KEY must be 32 bytes hex');
    }
    this.key = key;
  }

  static fromEnv(env: { readonly PLATFORM_SECRET_ENCRYPTION_KEY: string }): AesGcmSecretCipher {
    return new AesGcmSecretCipher(env.PLATFORM_SECRET_ENCRYPTION_KEY);
  }

  encrypt(plaintext: string): EncryptedSecret {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]),
      nonce,
      keyVersion: this.keyVersion,
    };
  }

  decrypt(secret: EncryptedSecret): string {
    if (secret.keyVersion !== this.keyVersion) {
      throw new Error(`unsupported secret key version ${secret.keyVersion}`);
    }
    if (secret.nonce.byteLength !== NONCE_BYTES) {
      throw new Error('invalid AES-GCM nonce length');
    }
    if (secret.ciphertext.byteLength < AUTH_TAG_BYTES) {
      throw new Error('invalid AES-GCM ciphertext');
    }
    const tag = secret.ciphertext.subarray(secret.ciphertext.byteLength - AUTH_TAG_BYTES);
    const encrypted = secret.ciphertext.subarray(0, secret.ciphertext.byteLength - AUTH_TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, secret.nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
