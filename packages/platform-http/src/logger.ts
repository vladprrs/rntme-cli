import pino from 'pino';
import type { Env } from './config/env.js';

export function createLogger(env: Env): pino.Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'authorization',
        'cookie',
        'token_hash',
        'token_plain',
        'rustfs_secret_access_key',
        'workos_api_key',
        'workos_webhook_secret',
      ],
      censor: '[REDACTED]',
    },
  });
}
