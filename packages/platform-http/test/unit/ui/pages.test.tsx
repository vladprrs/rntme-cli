import { describe, it, expect } from 'vitest';
import { LoginPage } from '../../../src/ui/pages/login.js';
import { NoOrgPage } from '../../../src/ui/pages/no-org.js';
import { ErrorPage } from '../../../src/ui/pages/error.js';

describe('LoginPage', () => {
  it('renders a Sign in link to /v1/auth/login', () => {
    const html = String(<LoginPage />);
    expect(html).toContain('href="/v1/auth/login"');
    expect(html).toMatch(/Sign in/i);
  });
});

describe('NoOrgPage', () => {
  it('renders empty state when no orgs', () => {
    const html = String(<NoOrgPage orgs={[]} />);
    expect(html).toMatch(/not a member of any organization/i);
    expect(html).toContain('/logout');
  });

  it('lists alternate orgs when present', () => {
    const html = String(
      <NoOrgPage orgs={[{ id: 'o1', slug: 'acme', displayName: 'Acme' } as never]} />,
    );
    expect(html).toContain('Acme');
  });
});

describe('ErrorPage', () => {
  it('renders status code and message', () => {
    const html = String(<ErrorPage status={404} title="Not found" detail="No such project" />);
    expect(html).toContain('404');
    expect(html).toContain('Not found');
    expect(html).toContain('No such project');
  });
});
