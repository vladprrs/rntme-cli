import { describe, expect, it } from 'vitest';
import { redact } from '../../../src/deploy/log-redactor.js';

describe('redact', () => {
  it('redacts common JSON secret fields while preserving key names', () => {
    const input = JSON.stringify({
      apiToken: 'tok_live_123',
      client_secret: 'client-secret-value',
      access_token: 'access-token-value',
      message: 'normal text with token mention',
    });

    expect(redact(input)).toBe(
      '{"apiToken":"***","client_secret":"***","access_token":"***","message":"normal text with token mention"}',
    );
  });

  it('redacts header-like authorization and api key values', () => {
    expect(redact('Authorization: Bearer abc.def-123\nx-api-key: key-123')).toBe(
      'Authorization: Bearer ***\nx-api-key: ***',
    );
    expect(redact('Authorization: Basic dXNlcjpwYXNz')).toBe('Authorization: Basic ***');
  });

  it('redacts URL query parameter secret values', () => {
    expect(redact('GET /callback?token=abc123&api_key=k456&client_secret=s789&name=demo')).toBe(
      'GET /callback?token=***&api_key=***&client_secret=***&name=demo',
    );
  });

  it('preserves existing password assignment redaction', () => {
    expect(redact('password=hunter2 next=visible')).toBe('password=*** next=visible');
  });
});
