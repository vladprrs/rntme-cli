import type { AuthSubject, Deployment, DeploymentLogLine, Organization, Project } from '@rntme-cli/platform-core';
import { Layout } from '../layout.js';
import { DeploymentLogsFragment } from '../fragments/deployment-logs.js';
import { DeploymentStatusFragment } from '../fragments/deployment-status.js';
import type { EnrichedSubject } from './org.js';

export function DeploymentPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  project: Project;
  deployment: Deployment;
  logs: readonly DeploymentLogLine[];
}) {
  const base = `/${props.subject.org.slug}/projects/${props.project.slug}/deployments/${props.deployment.id}`;
  return (
    <Layout title="Deployment" variant="authed" subject={props.subject as AuthSubject} otherOrgs={props.otherOrgs}>
      <nav class="mb-4 text-sm text-gray-500">
        <a href={`/${props.subject.org.slug}/projects/${props.project.slug}`} class="hover:underline">{props.project.slug}</a>
        <span class="mx-1">/</span>
        <a href={`/${props.subject.org.slug}/projects/${props.project.slug}/deployments`} class="hover:underline">deployments</a>
        <span class="mx-1">/</span>
        <span class="text-gray-900">{props.deployment.id.slice(0, 8)}</span>
      </nav>
      <h1 class="mb-3 text-xl font-semibold tracking-tight">Deployment</h1>
      <div hx-get={`${base}/status`} hx-trigger="load, every 2s" hx-swap="innerHTML">
        <DeploymentStatusFragment deployment={props.deployment} />
      </div>
      <div class="mt-6" hx-get={`${base}/logs?sinceLineId=0`} hx-trigger="load, every 2s" hx-swap="innerHTML">
        <DeploymentLogsFragment lines={props.logs} lastLineId={props.logs.at(-1)?.id ?? 0} />
      </div>
    </Layout>
  );
}
