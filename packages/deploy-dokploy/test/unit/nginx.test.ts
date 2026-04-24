import { describe, expect, it } from 'vitest';
import type { EdgePlan } from '@rntme-cli/deploy-core';
import { renderNginxConfig } from '../../src/nginx.js';

describe('renderNginxConfig', () => {
  it('renders upstreams, routes, request context, and rate limits', () => {
    const edge: EdgePlan = {
      routes: [
        { id: 'ui:/', kind: 'ui', path: '/', targetService: 'app', targetWorkload: 'app' },
        {
          id: 'http:/api/catalog',
          kind: 'http',
          path: '/api/catalog',
          targetService: 'catalog',
          targetWorkload: 'catalog',
        },
      ],
      middleware: [
        {
          mountTarget: 'http:/api/catalog',
          name: 'rateLimit',
          kind: 'rate-limit',
          policy: 'default',
          config: { requestsPerMinute: 60, burst: 20 },
        },
        {
          mountTarget: 'ui:/',
          name: 'requestContext',
          kind: 'request-context',
          policy: 'default',
          config: { requestIdHeader: 'x-request-id', correlationIdHeader: 'x-correlation-id' },
        },
      ],
    };

    const rendered = renderNginxConfig(edge, {
      app: 'http://rntme-acme-commerce-app:3000',
      catalog: 'http://rntme-acme-commerce-catalog:3000',
    });

    expect(rendered).toContain(
      'limit_req_zone $binary_remote_addr zone=http_api_catalog:10m rate=60r/m;',
    );
    expect(rendered).toContain('proxy_pass http://rntme-acme-commerce-catalog:3000;');
    expect(rendered).toContain('proxy_set_header x-request-id $request_id;');
    expect(rendered).toContain('location /api/catalog');
  });

  it('renders body limits and timeouts', () => {
    const edge: EdgePlan = {
      routes: [
        {
          id: 'http:/uploads',
          kind: 'http',
          path: '/uploads',
          targetService: 'uploads',
          targetWorkload: 'uploads',
        },
      ],
      middleware: [
        {
          mountTarget: 'http:/uploads',
          name: 'bodyLimit',
          kind: 'body-limit',
          policy: 'default',
          config: { maxBodySize: '10m' },
        },
        {
          mountTarget: 'http:/uploads',
          name: 'timeout',
          kind: 'timeout',
          policy: 'default',
          config: { upstreamTimeoutMs: 2500 },
        },
      ],
    };

    const rendered = renderNginxConfig(edge, {
      uploads: 'https://uploads.internal:8443',
    });

    expect(rendered).toContain('client_max_body_size 10m;');
    expect(rendered).toContain('proxy_connect_timeout 3s;');
    expect(rendered).toContain('proxy_read_timeout 3s;');
    expect(rendered).toContain('proxy_send_timeout 3s;');
  });

  it('rejects unsafe route paths before rendering locations', () => {
    const edge: EdgePlan = {
      routes: [
        {
          id: 'http:/bad',
          kind: 'http',
          path: '/bad; return 200',
          targetService: 'catalog',
          targetWorkload: 'catalog',
        },
      ],
      middleware: [],
    };

    expect(() =>
      renderNginxConfig(edge, { catalog: 'http://rntme-acme-commerce-catalog:3000' }),
    ).toThrow(TypeError);
  });

  it('rejects unsafe request-context header names', () => {
    const edge: EdgePlan = {
      routes: [
        {
          id: 'http:/api/catalog',
          kind: 'http',
          path: '/api/catalog',
          targetService: 'catalog',
          targetWorkload: 'catalog',
        },
      ],
      middleware: [
        {
          mountTarget: 'http:/api/catalog',
          name: 'requestContext',
          kind: 'request-context',
          policy: 'default',
          config: { requestIdHeader: 'x-request-id\nx-bad', correlationIdHeader: 'x-correlation-id' },
        },
      ],
    };

    expect(() =>
      renderNginxConfig(edge, { catalog: 'http://rntme-acme-commerce-catalog:3000' }),
    ).toThrow(TypeError);
  });

  it('rejects unsafe body limit values', () => {
    const edge: EdgePlan = {
      routes: [
        {
          id: 'http:/api/catalog',
          kind: 'http',
          path: '/api/catalog',
          targetService: 'catalog',
          targetWorkload: 'catalog',
        },
      ],
      middleware: [
        {
          mountTarget: 'http:/api/catalog',
          name: 'bodyLimit',
          kind: 'body-limit',
          policy: 'default',
          config: { maxBodySize: '10m; include /etc/passwd' },
        },
      ],
    };

    expect(() =>
      renderNginxConfig(edge, { catalog: 'http://rntme-acme-commerce-catalog:3000' }),
    ).toThrow(TypeError);
  });

  it('rejects unsafe upstream URLs', () => {
    const edge: EdgePlan = {
      routes: [
        {
          id: 'http:/api/catalog',
          kind: 'http',
          path: '/api/catalog',
          targetService: 'catalog',
          targetWorkload: 'catalog',
        },
      ],
      middleware: [],
    };

    expect(() =>
      renderNginxConfig(edge, { catalog: 'http://catalog.internal:3000; proxy_pass http://bad' }),
    ).toThrow(TypeError);
  });
});
