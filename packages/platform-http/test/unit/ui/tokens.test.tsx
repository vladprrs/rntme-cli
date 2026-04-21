import { describe, it, expect } from 'vitest';
import { TokenRow } from '../../../src/ui/fragments/token-row.js';
import { TokensPage } from '../../../src/ui/pages/tokens.js';
import type { TokenSummary } from '../../../src/ui/fragments/token-row.js';
import type { EnrichedSubject } from '../../../src/ui/pages/org.js';
import type { Organization } from '@rntme-cli/platform-core';

const subject: EnrichedSubject = {
  account: { id: 'a1', displayName: 'Ada' },
  org: { id: 'o1', slug: 'acme', displayName: 'Acme' },
  role: 'admin' as never,
  scopes: ['token:manage', 'project:read'] as never,
  tokenId: null,
} as never;

const subjectNoManage: EnrichedSubject = { ...subject, scopes: ['project:read'] as never } as never;

const tokens: readonly TokenSummary[] = [
  {
    id: 't1',
    name: 'ci',
    prefix: 'rntme_pat_1',
    scopes: ['project:read'],
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-04-20T00:00:00Z'),
  },
];

const otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[] = [];

const token0 = tokens[0]!;

describe('TokenRow', () => {
  it('renders name, prefix, revoke button when can manage', () => {
    const html = String(<TokenRow orgSlug="acme" token={token0} canManage={true} />);
    expect(html).toContain('ci');
    expect(html).toContain('rntme_pat_1');
    expect(html).toContain('hx-delete="/acme/tokens/t1"');
  });

  it('hides revoke button when cannot manage', () => {
    const html = String(<TokenRow orgSlug="acme" token={token0} canManage={false} />);
    expect(html).not.toContain('hx-delete');
  });

  it('renders revoked badge when token is revoked', () => {
    const revoked: TokenSummary = { ...token0, revokedAt: new Date() };
    const html = String(<TokenRow orgSlug="acme" token={revoked} canManage={true} />);
    expect(html).toContain('revoked');
    expect(html).not.toContain('hx-delete');
  });
});

import { TokenCreated } from '../../../src/ui/fragments/token-created.js';

describe('TokenCreated', () => {
  it('renders <tr> and out-of-band plaintext banner', () => {
    const html = String(
      <TokenCreated
        orgSlug="acme"
        token={{ ...tokens[0], id: 't2', name: 'new' } as never}
        plaintext="rntme_pat_abc123"
      />,
    );
    expect(html).toContain('hx-swap-oob="innerHTML:#token-created"');
    expect(html).toContain('rntme_pat_abc123');
    expect(html).toContain('<tr id="token-t2"');
    expect(html).toMatch(/won(?:'|&#39;)t be shown again/i);
  });
});

describe('TokensPage', () => {
  it('renders create form when subject has token:manage', () => {
    const html = String(<TokensPage subject={subject} otherOrgs={otherOrgs} tokens={tokens} />);
    expect(html).toContain('hx-post="/acme/tokens"');
    expect(html).toContain('name="name"');
  });

  it('hides create form when subject lacks token:manage', () => {
    const html = String(<TokensPage subject={subjectNoManage} otherOrgs={otherOrgs} tokens={tokens} />);
    expect(html).not.toContain('hx-post="/acme/tokens"');
  });

  it('renders empty state when no tokens', () => {
    const html = String(<TokensPage subject={subject} otherOrgs={otherOrgs} tokens={[]} />);
    expect(html).toMatch(/no tokens/i);
  });
});
