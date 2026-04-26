import { Layout } from '../layout.js';
import { DataTable } from '../components/table.js';
import { RelativeTime } from '../components/relative-time.js';
import type { AuthSubject, DeployTarget, Organization, Project, ProjectVersion } from '@rntme-cli/platform-core';
import type { EnrichedSubject } from './org.js';

export function ProjectVersionPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  project: Project;
  version: ProjectVersion;
  deployTargets?: readonly DeployTarget[];
}) {
  const { subject, project, version } = props;
  const back = `/${subject.org.slug}/projects/${project.slug}`;
  const routeRows = [
    ...Object.entries(version.summary.routes.ui).map(([path, service]) => ({
      key: `ui:${path}`,
      cells: ['UI', path, service],
    })),
    ...Object.entries(version.summary.routes.http).map(([path, service]) => ({
      key: `http:${path}`,
      cells: ['HTTP', path, service],
    })),
  ];

  return (
    <Layout title={`${project.displayName} #${version.seq}`} variant="authed" subject={subject as AuthSubject} otherOrgs={props.otherOrgs}>
      <nav class="mb-4 text-sm text-gray-500">
        <a href={`/${subject.org.slug}`} class="hover:underline">Projects</a> <span class="mx-1">/</span>
        <a href={back} class="hover:underline">{project.slug}</a> <span class="mx-1">/</span>
        <span class="text-gray-900">{`#${version.seq}`}</span>
      </nav>
      <header class="mb-6">
        <h1 class="text-xl font-semibold tracking-tight">Version #{version.seq}</h1>
        <p class="break-all text-xs text-gray-500">Digest: <code>{version.bundleDigest}</code></p>
        <p class="text-sm text-gray-600">
          {Math.round(version.bundleSizeBytes / 1024)} KB uploaded <RelativeTime value={version.createdAt} />
        </p>
      </header>

      <section class="mb-6 border-y border-gray-200 py-4">
        <form method="post" action={`/${subject.org.slug}/projects/${project.slug}/deployments`} class="flex flex-wrap items-end gap-3">
          <input type="hidden" name="projectVersionSeq" value={String(version.seq)} />
          <label class="text-sm">
            <span class="mb-1 block font-medium text-gray-900">Target</span>
            <select name="targetSlug" class="rounded border border-gray-300 px-2 py-1">
              <option value="">Default target</option>
              {(props.deployTargets ?? []).map((target) => (
                <option value={target.slug}>{target.displayName}</option>
              ))}
            </select>
          </label>
          <button type="submit" class="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700">Deploy</button>
        </form>
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-sm font-medium text-gray-900">Services</h2>
        {version.summary.services.length === 0 ? (
          <p class="text-sm text-gray-500">No services declared.</p>
        ) : (
          <ul class="list-disc pl-6 text-sm">
            {version.summary.services.map((s) => <li>{s}</li>)}
          </ul>
        )}
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-sm font-medium text-gray-900">Routes</h2>
        <DataTable headers={['Kind', 'Path', 'Service']} rows={routeRows} />
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-sm font-medium text-gray-900">Middleware</h2>
        {Object.keys(version.summary.middleware).length === 0 ? (
          <p class="text-sm text-gray-500">No middleware declared.</p>
        ) : (
          <pre class="rounded bg-gray-50 p-3 text-xs">{JSON.stringify(version.summary.middleware, null, 2)}</pre>
        )}
      </section>

      <a
        href={`/v1/orgs/${subject.org.slug}/projects/${project.slug}/versions/${version.seq}/bundle`}
        class="inline-block rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
      >
        Download bundle
      </a>
    </Layout>
  );
}
