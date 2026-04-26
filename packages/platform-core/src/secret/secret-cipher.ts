export type EncryptedSecret = {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyVersion: number;
};

export interface SecretCipher {
  encrypt(plaintext: string): EncryptedSecret;
  decrypt(secret: EncryptedSecret): string;
}
