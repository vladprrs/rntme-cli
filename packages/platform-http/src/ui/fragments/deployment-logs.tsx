import type { DeploymentLogLine } from '@rntme-cli/platform-core';

export function DeploymentLogsFragment(props: { lines: readonly DeploymentLogLine[]; lastLineId: number }) {
  return (
    <section data-last-line-id={String(props.lastLineId)}>
      <h2 class="mb-2 text-sm font-medium text-gray-900">Logs</h2>
      <pre class="max-h-96 overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-100">
        {props.lines.map((line) => `[${line.level}] ${line.step}: ${line.message}`).join('\n')}
      </pre>
    </section>
  );
}
