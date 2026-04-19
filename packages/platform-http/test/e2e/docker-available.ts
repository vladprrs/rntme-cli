import { spawnSync } from 'node:child_process';

let cached: boolean | undefined;

/** True when Docker is reachable (same idea as integration tests that need testcontainers). */
export function e2eContainersAvailable(): boolean {
  if (process.env['SKIP_TESTCONTAINERS'] === '1') return false;
  if (cached !== undefined) return cached;
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  cached = r.status === 0;
  return cached;
}
