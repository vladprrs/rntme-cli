import { spawnSync } from 'node:child_process';

let cached: boolean | undefined;

/** False when `SKIP_TESTCONTAINERS=1` or the Docker daemon is not reachable. */
export function integrationContainersAvailable(): boolean {
  if (process.env['SKIP_TESTCONTAINERS'] === '1') return false;
  if (cached !== undefined) return cached;
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  cached = r.status === 0;
  return cached;
}
