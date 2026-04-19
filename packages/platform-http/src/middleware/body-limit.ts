import type { MiddlewareHandler } from 'hono';

export function bodyLimit(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('content-length');
    const declared = header !== undefined ? Number(header) : undefined;
    const declaredValid = declared !== undefined && Number.isFinite(declared) && declared >= 0;
    if (declaredValid) {
      if (declared > maxBytes) {
        return c.json(
          { error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: `body exceeds ${maxBytes} bytes` } },
          413,
        );
      }
      return next();
    }
    const raw = c.req.raw.body;
    if (raw) {
      const reader = raw.getReader();
      let total = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          return c.json(
            { error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: `body exceeds ${maxBytes} bytes` } },
            413,
          );
        }
        chunks.push(value);
      }
      const body = new Blob(chunks as unknown as BlobPart[]);
      const req = new Request(c.req.url, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body,
      });
      (c.req as unknown as { raw: Request }).raw = req;
    }
    return next();
  };
}
