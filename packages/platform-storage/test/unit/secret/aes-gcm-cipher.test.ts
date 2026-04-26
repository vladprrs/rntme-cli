import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { AesGcmSecretCipher } from '../../../src/secret/aes-gcm-cipher.js';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('AesGcmSecretCipher', () => {
  it('round-trips plaintext without returning plaintext bytes', () => {
    const cipher = new AesGcmSecretCipher(KEY);
    const encrypted = cipher.encrypt('dokploy-token-secret');

    expect(encrypted.keyVersion).toBe(1);
    expect(encrypted.nonce).toHaveLength(12);
    expect(Buffer.from(encrypted.ciphertext).toString('utf8')).not.toContain('dokploy-token-secret');
    expect(cipher.decrypt(encrypted)).toBe('dokploy-token-secret');
  });

  it('rejects invalid key material', () => {
    expect(() => new AesGcmSecretCipher('not-hex')).toThrow(/PLATFORM_SECRET_ENCRYPTION_KEY/);
  });
});
