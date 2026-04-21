import { Layout } from '../layout.js';
import { DataTable } from '../components/table.js';
import { EmptyState } from '../components/empty-state.js';
import { RelativeTime } from '../components/relative-time.js';
import type { AuthSubject, Organization, Project, Service, ArtifactVersion, ArtifactTag } from '@rntme-cli/platform-core';
import type { EnrichedSubject } from './org.js';

export function ServicePage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  project: Project;
  service: Service;
  versions: readonly ArtifactVersion[];
  tags: readonly ArtifactTag[];
}) {
  const { subject, project, service, versions, tags } = props;
  return (
    <Layout title={service.displayName} variant="authed" subject={subject as AuthSubject} otherOrgs={props.otherOrgs}>
      <nav class="mb-4 text-sm text-gray-500">
        <a href={`/${subject.org.slug}`} class="hover:underline">Projects</a>{' '}
        <span class="mx-1">/</span>{' '}
        <a href={`/${subject.org.slug}/projects/${project.slug}`} class="hover:underline">{project.slug}</a>
        <span class="mx-1">/</span>
        <span class="text-gray-900">{service.slug}</span>
      </nav>
      <header class="mb-6">
        <h1 class="text-xl font-semibold tracking-tight">{service.displayName}</h1>
        <p class="text-sm text-gray-600">Slug: <code class="rounded bg-gray-100 px-1">{service.slug}</code></p>
      </header>

      {tags.length > 0 && (
        <section class="mb-6">
          <h2 class="mb-2 text-sm font-medium text-gray-900">Tags</h2>
          <ul class="flex flex-wrap gap-2 text-sm">
            {tags.map((t) => {
              // ArtifactTag carries versionId (UUID); resolve seq from loaded versions list.
              const seq = versions.find((v) => v.id === t.versionId)?.seq;
              return (
                <li key={t.name} class="rounded-full border border-gray-200 bg-white px-2 py-1">
                  <span class="font-medium">{t.name}</span>
                  {seq !== undefined && <span class="ml-1 text-gray-500">→ #{seq}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h2 class="mb-2 text-sm font-medium text-gray-900">Versions</h2>
      {versions.length === 0 ? (
        <EmptyState
          title="No versions published yet."
          hint="Publish with the CLI:"
          code={`rntme platform publish --service ${project.slug}/${service.slug}`}
        />
      ) : (
        <DataTable
          headers={['#', 'Bundle digest', 'Published']}
          rows={versions.map((v) => ({
            key: String(v.seq),
            cells: [
              `#${v.seq}`,
              <code class="text-xs text-gray-600">{v.bundleDigest.slice(0, 12)}…</code>,
              <RelativeTime value={v.publishedAt} />,
            ],
          }))}
        />
      )}
    </Layout>
  );
}
