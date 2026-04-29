import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { AesGcmSecretCipher } from '../../../src/secret/aes-gcm-cipher.js';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PREVIOUS_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

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

  it('decrypts secrets encrypted with a previous key version', () => {
    const previous = new AesGcmSecretCipher(PREVIOUS_KEY, 1);
    const encrypted = previous.encrypt('rotated-secret');
    const current = AesGcmSecretCipher.fromKeyRing({
      current: { version: 2, keyHex: KEY },
      previous: [{ version: 1, keyHex: PREVIOUS_KEY }],
    });

    expect(current.encrypt('new-secret').keyVersion).toBe(2);
    expect(current.decrypt(encrypted)).toBe('rotated-secret');
  });

  it('rejects unsupported key versions', () => {
    const cipher = AesGcmSecretCipher.fromKeyRing({
      current: { version: 2, keyHex: KEY },
      previous: [],
    });

    expect(() =>
      cipher.decrypt({
        ciphertext: Buffer.from('ciphertext'),
        nonce: Buffer.alloc(12),
        keyVersion: 1,
      }),
    ).toThrow(/unsupported secret key version 1/);
  });
});
