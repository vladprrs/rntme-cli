import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

export function isAllowedOrigin(origin: string, allow: readonly string[]): boolean {
  for (const allowed of allow) {
    if (allowed === '*') return true;
    if (allowed === origin) return true;
    if (allowed.includes('*') && wildcardMatch(origin, allowed)) return true;
  }
  return false;
}

export function corsMiddleware(originsCsv: string): MiddlewareHandler {
  const allow = originsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => {
      return isAllowedOrigin(origin, allow) ? origin : null;
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });
}

function wildcardMatch(text: string, pattern: string): boolean {
  let textIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let textAfterStar = 0;

  while (textIndex < text.length) {
    if (patternIndex < pattern.length && pattern[patternIndex] === text[textIndex]) {
      textIndex += 1;
      patternIndex += 1;
      continue;
    }

    if (patternIndex < pattern.length && pattern[patternIndex] === '*') {
      starIndex = patternIndex;
      textAfterStar = textIndex;
      patternIndex += 1;
      continue;
    }

    if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      textAfterStar += 1;
      textIndex = textAfterStar;
      continue;
    }

    return false;
  }

  while (patternIndex < pattern.length && pattern[patternIndex] === '*') {
    patternIndex += 1;
  }

  return patternIndex === pattern.length;
}
