import { Layout } from '../layout.js';
import { DataTable } from '../components/table.js';
import { EmptyState } from '../components/empty-state.js';
import { RelativeTime } from '../components/relative-time.js';
import type { AuthSubject, Organization, Project, Service } from '@rntme-cli/platform-core';
import type { EnrichedSubject } from './org.js';

export function ProjectPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  project: Project;
  services: readonly Service[];
}) {
  const { subject, project, services } = props;
  const back = `/${subject.org.slug}`;
  return (
    <Layout title={project.displayName} variant="authed" subject={subject as AuthSubject} otherOrgs={props.otherOrgs}>
      <nav class="mb-4 text-sm text-gray-500">
        <a href={back} class="hover:underline">Projects</a> <span class="mx-1">/</span>
        <span class="text-gray-900">{project.slug}</span>
      </nav>
      <header class="mb-6">
        <h1 class="text-xl font-semibold tracking-tight">{project.displayName}</h1>
        <p class="text-sm text-gray-600">Slug: <code class="rounded bg-gray-100 px-1">{project.slug}</code></p>
      </header>
      <h2 class="mb-2 text-sm font-medium text-gray-900">Services</h2>
      {services.length === 0 ? (
        <EmptyState
          title="No services yet."
          hint="Create one with the CLI:"
          code={`rntme platform service create ${project.slug} <slug>`}
        />
      ) : (
        <DataTable
          headers={['Slug', 'Name', 'Updated']}
          rows={services.map((s) => ({
            key: s.id,
            cells: [
              <a
                href={`/${subject.org.slug}/projects/${project.slug}/services/${s.slug}`}
                class="font-medium text-blue-700 hover:underline"
              >
                {s.slug}
              </a>,
              s.displayName,
              <RelativeTime value={s.updatedAt ?? s.createdAt} />,
            ],
          }))}
        />
      )}
    </Layout>
  );
}
