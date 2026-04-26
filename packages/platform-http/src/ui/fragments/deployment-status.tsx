import type { Deployment } from '@rntme-cli/platform-core';

export function DeploymentStatusFragment(props: { deployment: Deployment }) {
  const terminal = !['queued', 'running'].includes(props.deployment.status);
  return (
    <section class="rounded border border-gray-200 bg-white p-4" {...(!terminal ? { 'hx-trigger': 'every 2s' } : {})}>
      <div class="text-sm text-gray-500">Status</div>
      <div class="text-lg font-semibold">{props.deployment.status}</div>
      {props.deployment.errorMessage && <p class="mt-2 text-sm text-red-700">{props.deployment.errorMessage}</p>}
    </section>
  );
}
