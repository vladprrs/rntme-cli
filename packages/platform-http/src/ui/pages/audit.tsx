import { Layout } from '../layout.js';
import { DataTable } from '../components/table.js';
import { EmptyState } from '../components/empty-state.js';
import { RelativeTime } from '../components/relative-time.js';
import type { AuthSubject, Organization, AuditLogEntry } from '@rntme-cli/platform-core';
import type { EnrichedSubject } from './org.js';

export function AuditPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  events: readonly AuditLogEntry[];
}) {
  const { subject, events } = props;
  return (
    <Layout title="Audit" variant="authed" subject={subject as AuthSubject} otherOrgs={props.otherOrgs}>
      <header class="mb-6">
        <h1 class="text-xl font-semibold tracking-tight">Audit log</h1>
        <p class="text-sm text-gray-600">Recent events in {subject.org.displayName}.</p>
      </header>
      {events.length === 0 ? (
        <EmptyState title="No events yet." />
      ) : (
        <DataTable
          headers={['When', 'Actor', 'Action', 'Resource']}
          rows={events.map((e) => ({
            key: String(e.id),
            cells: [
              <RelativeTime value={e.createdAt} />,
              e.actorAccountId ?? '—',
              <code class="text-xs">{e.action}</code>,
              <code class="text-xs">{e.resourceKind}:{e.resourceId ?? '—'}</code>,
            ],
          }))}
        />
      )}
    </Layout>
  );
}
