import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedSecret, SecretCipher } from '@rntme-cli/platform-core';

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type AesGcmKeyRingConfig = {
  readonly current: {
    readonly version: number;
    readonly keyHex: string;
  };
  readonly previous?: readonly {
    readonly version: number;
    readonly keyHex: string;
  }[];
};

export class AesGcmSecretCipher implements SecretCipher {
  private readonly keysByVersion: ReadonlyMap<number, Buffer>;
  private readonly currentKey: Buffer;
  private readonly keyVersion: number;

  constructor(keyHex: string, keyVersion?: number);
  constructor(keyHex: string, keyVersion: number, keysByVersion: ReadonlyMap<number, Buffer>);
  constructor(keyHex: string, keyVersion = 1, keysByVersion?: ReadonlyMap<number, Buffer>) {
    this.keyVersion = keyVersion;
    this.currentKey = parseKey(keyHex);
    this.keysByVersion = keysByVersion ?? new Map([[keyVersion, this.currentKey]]);
  }

  static fromEnv(env: { readonly PLATFORM_SECRET_ENCRYPTION_KEY: string }): AesGcmSecretCipher {
    return new AesGcmSecretCipher(env.PLATFORM_SECRET_ENCRYPTION_KEY);
  }

  static fromKeyRing(config: AesGcmKeyRingConfig): AesGcmSecretCipher {
    const cipher = new AesGcmSecretCipher(config.current.keyHex, config.current.version);
    const keysByVersion = new Map<number, Buffer>([[config.current.version, cipher.currentKey]]);
    for (const entry of config.previous ?? []) {
      if (keysByVersion.has(entry.version)) {
        throw new Error(`duplicate secret key version ${entry.version}`);
      }
      keysByVersion.set(entry.version, parseKey(entry.keyHex));
    }
    return new AesGcmSecretCipher(config.current.keyHex, config.current.version, keysByVersion);
  }

  encrypt(plaintext: string): EncryptedSecret {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.currentKey, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]),
      nonce,
      keyVersion: this.keyVersion,
    };
  }

  decrypt(secret: EncryptedSecret): string {
    const key = this.keysByVersion.get(secret.keyVersion);
    if (!key) {
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
    const decipher = createDecipheriv('aes-256-gcm', key, secret.nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}

function parseKey(keyHex: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error('PLATFORM_SECRET_ENCRYPTION_KEY must be 32 bytes hex');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.byteLength !== KEY_BYTES) {
    throw new Error('PLATFORM_SECRET_ENCRYPTION_KEY must be 32 bytes hex');
  }
  return key;
}
