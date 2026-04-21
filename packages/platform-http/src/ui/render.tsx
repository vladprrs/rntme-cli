import type { Context } from 'hono';
import type { JSX } from 'hono/jsx/jsx-runtime';

/**
 * Render a JSX tree as a full HTML response with doctype and text/html charset.
 * All string interpolation in JSX is HTML-escaped by `hono/jsx` — do not bypass
 * by returning strings through `raw()` unless the source is trusted HTML.
 */
export function renderHtml(c: Context, node: JSX.Element, status: 200 | 400 | 403 | 404 | 500 = 200) {
  const body = '<!DOCTYPE html>\n' + String(node);
  c.status(status);
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.body(body);
}
