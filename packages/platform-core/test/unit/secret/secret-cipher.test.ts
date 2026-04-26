import { describe, expect, it } from 'vitest';
import type { SecretCipher } from '../../../src/secret/secret-cipher.js';

describe('SecretCipher', () => {
  it('defines the encryption seam shape', () => {
    const cipher: SecretCipher = {
      encrypt: (plaintext) => ({
        ciphertext: Buffer.from(plaintext),
        nonce: Buffer.alloc(12),
        keyVersion: 1,
      }),
      decrypt: ({ ciphertext }) => ciphertext.toString('utf8'),
    };

    const encrypted = cipher.encrypt('secret');
    expect(cipher.decrypt(encrypted)).toBe('secret');
  });
});
