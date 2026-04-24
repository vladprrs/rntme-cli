import type { EdgeMiddleware, EdgePlan, EdgeRoute } from '@rntme-cli/deploy-core';

export function renderNginxConfig(
  edge: EdgePlan,
  upstreams: Readonly<Record<string, string>>,
): string {
  const zones = edge.middleware
    .filter((m) => m.kind === 'rate-limit')
    .map((m) => {
      const zone = zoneName(m.mountTarget);
      return `limit_req_zone $binary_remote_addr zone=${zone}:10m rate=${m.config.requestsPerMinute}r/m;`;
    });

  const locations = edge.routes.map((route) =>
    renderLocation(
      route,
      upstreams[route.targetWorkload] ?? `http://${route.targetWorkload}:3000`,
      edge.middleware,
    ),
  );

  return [
    'events {}',
    'http {',
    ...zones.map((line) => `  ${line}`),
    '  server {',
    '    listen 8080;',
    '    location = /health { return 200 "ok\\n"; }',
    ...locations,
    '  }',
    '}',
    '',
  ].join('\n');
}

function renderLocation(
  route: EdgeRoute,
  upstream: string,
  middleware: readonly EdgeMiddleware[],
): string {
  assertSafeLocationPath(route.path);
  assertSafeUpstreamUrl(upstream);
  const applied = middleware.filter((m) => m.mountTarget === route.id);
  const lines = [`    location ${route.path} {`];

  for (const m of applied) {
    if (m.kind === 'rate-limit') {
      lines.push(`      limit_req zone=${zoneName(m.mountTarget)} burst=${m.config.burst};`);
    }
    if (m.kind === 'body-limit') {
      assertSafeBodyLimit(m.config.maxBodySize);
      lines.push(`      client_max_body_size ${m.config.maxBodySize};`);
    }
    if (m.kind === 'timeout') {
      const seconds = Math.ceil(m.config.upstreamTimeoutMs / 1000);
      lines.push(`      proxy_connect_timeout ${seconds}s;`);
      lines.push(`      proxy_read_timeout ${seconds}s;`);
      lines.push(`      proxy_send_timeout ${seconds}s;`);
    }
    if (m.kind === 'request-context') {
      const requestHeader = m.config.requestIdHeader ?? 'x-request-id';
      const correlationHeader = m.config.correlationIdHeader ?? 'x-correlation-id';
      assertSafeHeaderName(requestHeader);
      assertSafeHeaderName(correlationHeader);
      lines.push(`      proxy_set_header ${requestHeader} $request_id;`);
      lines.push(
        `      proxy_set_header ${correlationHeader} $http_${headerVariable(correlationHeader)};`,
      );
    }
  }

  lines.push('      proxy_set_header Host $host;');
  lines.push('      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
  lines.push(`      proxy_pass ${upstream};`);
  lines.push('    }');
  return lines.join('\n');
}

function zoneName(target: string): string {
  return target.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function headerVariable(header: string): string {
  return header.toLowerCase().replace(/-/g, '_');
}

function assertSafeLocationPath(path: string): void {
  if (!/^\/[A-Za-z0-9/_~.-]*$/.test(path)) {
    throw new TypeError(`unsafe Nginx location path: ${path}`);
  }
}

function assertSafeHeaderName(header: string): void {
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(header)) {
    throw new TypeError(`unsafe Nginx header name: ${header}`);
  }
}

function assertSafeBodyLimit(value: string): void {
  if (!/^(0|[1-9][0-9]*[kKmMgG]?)$/.test(value)) {
    throw new TypeError(`unsafe Nginx body limit: ${value}`);
  }
}

function assertSafeUpstreamUrl(value: string): void {
  if (hasUnsafeRawUpstreamChar(value)) {
    throw new TypeError(`unsafe Nginx upstream URL: ${value}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`unsafe Nginx upstream URL: ${value}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError(`unsafe Nginx upstream URL: ${value}`);
  }
}

function hasUnsafeRawUpstreamChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f || char === ';' || char === '{' || char === '}') {
      return true;
    }
  }
  return false;
}
