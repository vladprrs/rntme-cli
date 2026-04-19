import { randomUUID, randomBytes } from 'node:crypto';

export interface Ids {
  uuid(): string;
  apiTokenPlaintext(): string;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function base62(bytes: Buffer, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += BASE62[bytes[i % bytes.length]! % 62];
  return out;
}

export class RandomIds implements Ids {
  uuid(): string {
    return randomUUID();
  }
  apiTokenPlaintext(): string {
    return 'rntme_pat_' + base62(randomBytes(22), 22);
  }
}

export class SeededIds implements Ids {
  private i = 0;
  constructor(
    private readonly uuids: readonly string[],
    private readonly opts: { tokenBody?: string } = {},
  ) {}
  uuid(): string {
    const v = this.uuids[this.i++];
    if (!v) throw new Error('SeededIds exhausted');
    return v;
  }
  apiTokenPlaintext(): string {
    return 'rntme_pat_' + (this.opts.tokenBody ?? '00000000000000000000aa');
  }
}
