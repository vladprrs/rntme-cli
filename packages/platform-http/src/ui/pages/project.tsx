import { Layout } from '../layout.js';
import { DataTable } from '../components/table.js';
import { EmptyState } from '../components/empty-state.js';
import { RelativeTime } from '../components/relative-time.js';
import type { AuthSubject, Organization, Project, ProjectVersion } from '@rntme-cli/platform-core';
import type { EnrichedSubject } from './org.js';

export function ProjectPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  project: Project;
  versions: readonly ProjectVersion[];
}) {
  const { subject, project, versions } = props;
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
      <h2 class="mb-2 text-sm font-medium text-gray-900">Project versions</h2>
      {versions.length === 0 ? (
        <EmptyState
          title="No versions yet."
          hint="Publish a blueprint with the CLI:"
          code="rntme project publish --create-project"
        />
      ) : (
        <DataTable
          headers={['Seq', 'Digest', 'Services', 'Uploaded']}
          rows={versions.map((v) => ({
            key: v.id,
            cells: [
              <a
                href={`/${subject.org.slug}/projects/${project.slug}/versions/${v.seq}`}
                class="font-medium text-blue-700 hover:underline"
              >
                {`#${v.seq}`}
              </a>,
              <code class="text-xs text-gray-500">{v.bundleDigest.slice(0, 17)}...</code>,
              String(v.summary.services.length),
              <RelativeTime value={v.createdAt} />,
            ],
          }))}
        />
      )}
    </Layout>
  );
}
