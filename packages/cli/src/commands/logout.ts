import { unlink } from 'node:fs/promises';
import { credentialsPath } from '../config/credentials.js';
import { formatSuccess } from '../output/format.js';
import type { OutputMode } from '../output/format.js';

export type LogoutFlags = { json?: boolean };

export async function runLogout(flags: LogoutFlags): Promise<number> {
  const mode: OutputMode = flags.json ? 'json' : 'human';
  const path = credentialsPath();
  try {
    await unlink(path);
  } catch {
    // already gone — no-op
  }
  process.stdout.write(
    formatSuccess(mode, { credentialsPath: path }, (d) => `✓ logged out (removed ${d.credentialsPath})`) + '\n',
  );
  return 0;
}
