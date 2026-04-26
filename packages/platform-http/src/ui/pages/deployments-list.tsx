import type { AuthSubject, Deployment, Organization, Project } from '@rntme-cli/platform-core';
import { DataTable } from '../components/table.js';
import { RelativeTime } from '../components/relative-time.js';
import { Layout } from '../layout.js';
import type { EnrichedSubject } from './org.js';

export function DeploymentsListPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  project: Project;
  deployments: readonly Deployment[];
}) {
  return (
    <Layout title={`${props.project.displayName} deployments`} variant="authed" subject={props.subject as AuthSubject} otherOrgs={props.otherOrgs}>
      <nav class="mb-4 text-sm text-gray-500">
        <a href={`/${props.subject.org.slug}/projects/${props.project.slug}`} class="hover:underline">{props.project.slug}</a>
        <span class="mx-1">/</span>
        <span class="text-gray-900">deployments</span>
      </nav>
      <h1 class="mb-4 text-xl font-semibold tracking-tight">Deployments</h1>
      <DataTable
        headers={['Deployment', 'Status', 'Queued']}
        rows={props.deployments.map((deployment) => ({
          key: deployment.id,
          cells: [
            <a class="font-medium text-blue-700 hover:underline" href={`/${props.subject.org.slug}/projects/${props.project.slug}/deployments/${deployment.id}`}>{deployment.id.slice(0, 8)}</a>,
            deployment.status,
            <RelativeTime value={deployment.queuedAt} />,
          ],
        }))}
      />
    </Layout>
  );
}
