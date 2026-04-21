import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { renderHtml } from '../../../src/ui/render.js';

describe('renderHtml', () => {
  it('serves JSX with doctype and text/html content-type', async () => {
    const app = new Hono();
    app.get('/x', (c) => renderHtml(c, <div id="root">hi</div>));
    const r = await app.request('/x');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/html; charset=utf-8/);
    const text = await r.text();
    expect(text.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(text).toContain('<div id="root">hi</div>');
  });

  it('escapes user content', async () => {
    const app = new Hono();
    const dangerous = '<script>alert(1)</script>';
    app.get('/x', (c) => renderHtml(c, <div>{dangerous}</div>));
    const r = await app.request('/x');
    const text = await r.text();
    expect(text).not.toContain('<script>alert(1)</script>');
    expect(text).toContain('&lt;script&gt;');
  });
});
