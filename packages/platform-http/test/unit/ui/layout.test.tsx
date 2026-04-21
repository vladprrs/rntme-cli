import { describe, it, expect } from 'vitest';
import { Layout } from '../../../src/ui/layout.js';

describe('Layout', () => {
  it('renders <html>, CDN tags, and children', () => {
    const html = String(
      <Layout title="My page">
        <p>hello</p>
      </Layout>,
    );
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>My page · rntme</title>');
    expect(html).toContain('src="https://cdn.tailwindcss.com"');
    expect(html).toContain('src="https://unpkg.com/htmx.org@2');
    expect(html).toContain('<p>hello</p>');
  });

  it('omits <Header> on public pages', () => {
    const html = String(
      <Layout title="Login" variant="public">
        <p>log in</p>
      </Layout>,
    );
    expect(html).not.toContain('<nav');
  });

  it('renders <Header> with org name on authed pages', () => {
    const html = String(
      <Layout
        title="Dash"
        variant="authed"
        subject={{
          account: { id: 'a1', displayName: 'Ada' } as never,
          org: { id: 'o1', slug: 'acme', displayName: 'Acme' } as never,
          role: 'member' as never,
          scopes: ['project:read'] as never,
          tokenId: null,
        } as never}
        otherOrgs={[]}
      >
        <main>body</main>
      </Layout>,
    );
    expect(html).toContain('<nav');
    expect(html).toContain('Acme');
    expect(html).toContain('Ada');
  });
});
