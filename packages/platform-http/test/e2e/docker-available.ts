import { spawnSync } from 'node:child_process';

let cached: boolean | undefined;

/** True when Docker is reachable (same idea as integration tests that need testcontainers). */
export function e2eContainersAvailable(): boolean {
  if (process.env['PLATFORM_TEST_DATABASE_URL'] && hasExternalS3()) return true;
  if (process.env['SKIP_TESTCONTAINERS'] === '1') return false;
  if (cached !== undefined) return cached;
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  cached = r.status === 0;
  return cached;
}

function hasExternalS3(): boolean {
  return Boolean(
    process.env['PLATFORM_TEST_S3_ENDPOINT'] &&
      process.env['PLATFORM_TEST_S3_BUCKET'] &&
      process.env['PLATFORM_TEST_S3_ACCESS_KEY_ID'] &&
      process.env['PLATFORM_TEST_S3_SECRET_ACCESS_KEY'],
  );
}
