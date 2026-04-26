import { spawnSync } from 'node:child_process';

let cached: boolean | undefined;

/**
 * True when a Postgres is available to the suite.
 *
 * Two backends:
 *  - External: set `PLATFORM_TEST_DATABASE_URL` to bypass testcontainers and
 *    run against a long-lived Postgres (e.g. a disposable Dokploy instance).
 *  - Testcontainers: default, requires the Docker daemon.
 *
 * Opt-out: `SKIP_TESTCONTAINERS=1` forces skip even when Docker is up.
 */
export function integrationContainersAvailable(): boolean {
  if (process.env['PLATFORM_TEST_DATABASE_URL']) return true;
  if (process.env['SKIP_TESTCONTAINERS'] === '1') return false;
  return dockerAvailable();
}

export function dockerAvailable(): boolean {
  if (cached !== undefined) return cached;
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  cached = r.status === 0;
  return cached;
}
