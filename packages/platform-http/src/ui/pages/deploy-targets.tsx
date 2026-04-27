import type { AuthSubject, DeployTarget, Organization } from '@rntme-cli/platform-core';
import { DataTable } from '../components/table.js';
import { Layout } from '../layout.js';
import type { EnrichedSubject } from './org.js';

export function DeployTargetsPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  targets: readonly DeployTarget[];
}) {
  return (
    <Layout title="Deploy targets" variant="authed" subject={props.subject as AuthSubject} otherOrgs={props.otherOrgs}>
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">Deploy targets</h1>
          <p class="text-sm text-gray-600">Dokploy credentials and default deploy settings for this org.</p>
        </div>
      </header>
      <DataTable
        headers={['Slug', 'Kind', 'Dokploy', 'Public URL', 'Default']}
        rows={props.targets.map((target) => ({
          key: target.id,
          cells: [
            <a class="font-medium text-blue-700 hover:underline" href={`/${props.subject.org.slug}/deploy-targets/${target.slug}`}>{target.slug}</a>,
            target.kind,
            target.dokployUrl,
            target.publicBaseUrl,
            target.isDefault ? 'Yes' : 'No',
          ],
        }))}
      />
    </Layout>
  );
}

export function DeployTargetDetailPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  target: DeployTarget;
}) {
  const target = props.target;
  return (
    <Layout title={target.displayName} variant="authed" subject={props.subject as AuthSubject} otherOrgs={props.otherOrgs}>
      <nav class="mb-4 text-sm text-gray-500">
        <a href={`/${props.subject.org.slug}/deploy-targets`} class="hover:underline">Deploy targets</a>
        <span class="mx-1">/</span>
        <span class="text-gray-900">{target.slug}</span>
      </nav>
      <h1 class="text-xl font-semibold tracking-tight">{target.displayName}</h1>
      <dl class="mt-4 grid gap-3 text-sm">
        <div><dt class="font-medium">Kind</dt><dd>{target.kind}</dd></div>
        <div><dt class="font-medium">Dokploy URL</dt><dd>{target.dokployUrl}</dd></div>
        <div><dt class="font-medium">Public URL</dt><dd>{target.publicBaseUrl}</dd></div>
        <div><dt class="font-medium">Project</dt><dd>{target.dokployProjectId ?? target.dokployProjectName ?? 'Not configured'}</dd></div>
        <div><dt class="font-medium">API token</dt><dd>{target.apiTokenRedacted}</dd></div>
      </dl>
    </Layout>
  );
}
