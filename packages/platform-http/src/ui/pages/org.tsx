import { Layout } from '../layout.js';
import { DataTable } from '../components/table.js';
import { EmptyState } from '../components/empty-state.js';
import { RelativeTime } from '../components/relative-time.js';
import type { AuthSubject, Organization, Project } from '@rntme-cli/platform-core';

/** AuthSubject enriched with org.displayName for rendering. */
export type EnrichedSubject = AuthSubject & {
  readonly org: AuthSubject['org'] & { readonly displayName: string };
};

export function OrgPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  projects: readonly Project[];
  flash?: string | undefined;
}) {
  const { subject, projects } = props;
  return (
    <Layout title={subject.org.displayName} variant="authed" subject={subject as never} otherOrgs={props.otherOrgs} flash={props.flash}>
      <header class="mb-6">
        <h1 class="text-xl font-semibold tracking-tight">Projects</h1>
        <p class="text-sm text-gray-600">All active projects in {subject.org.displayName}.</p>
      </header>
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet."
          hint="Create one with the CLI:"
          code={`rntme platform project create <slug>`}
        />
      ) : (
        <DataTable
          headers={['Slug', 'Name', 'Updated']}
          rows={projects.map((p) => ({
            key: p.id,
            cells: [
              <a href={`/${subject.org.slug}/projects/${p.slug}`} class="font-medium text-blue-700 hover:underline">
                {p.slug}
              </a>,
              p.displayName,
              <RelativeTime value={p.updatedAt ?? p.createdAt} />,
            ],
          }))}
        />
      )}
    </Layout>
  );
}
