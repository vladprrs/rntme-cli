import { describe, it, expect } from 'vitest';
import { LoginPage } from '../../../src/ui/pages/login.js';
import { NoOrgPage } from '../../../src/ui/pages/no-org.js';
import { ErrorPage } from '../../../src/ui/pages/error.js';
import { DeployTargetsPage } from '../../../src/ui/pages/deploy-targets.js';

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

describe('DeployTargetsPage', () => {
  it('shows wildcard auto URL mode instead of not configured for null public URLs', () => {
    const html = String(
      <DeployTargetsPage
        subject={subject()}
        otherOrgs={[]}
        publicDeployDomain="*.rntme.com"
        targets={[
          {
            id: 'target-1',
            orgId: 'org-1',
            slug: 'dokploy-demos',
            displayName: 'Dokploy demos',
            kind: 'dokploy',
            dokployUrl: 'https://dokploy.example.test',
            publicBaseUrl: null,
            dokployProjectId: 'project-1',
            dokployProjectName: null,
            allowCreateProject: false,
            apiTokenRedacted: '***',
            eventBus: { kind: 'kafka', brokers: ['redpanda:9092'] },
            policyValues: {},
            isDefault: true,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
        ]}
      />,
    );

    expect(html).toContain('Auto (*.rntme.com)');
    expect(html).not.toContain('Public URL</th><td>Not configured');
  });
});

function subject() {
  return {
    account: { id: 'account-1', email: 'test@example.com' },
    org: { id: 'org-1', slug: 'acme', displayName: 'Acme' },
    role: 'admin',
    scopes: [],
    tokenId: null,
  } as never;
}
