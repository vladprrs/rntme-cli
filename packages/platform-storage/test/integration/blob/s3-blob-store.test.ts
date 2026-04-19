import { Buffer } from 'node:buffer';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { S3BlobStore } from '../../../src/blob/s3-blob-store.js';
import { isOk } from '@rntme-cli/platform-core';

/** Set to `1` when no container runtime (Docker/Podman) is available; CI should run with unset. */
const skipContainers = process.env['SKIP_TESTCONTAINERS'] === '1';

describe.skipIf(skipContainers)('S3BlobStore', () => {
  let minio: StartedTestContainer | undefined;
  let store: S3BlobStore;

  beforeAll(async () => {
    minio = await new GenericContainer('minio/minio:latest')
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: 'minio', MINIO_ROOT_PASSWORD: 'minio12345' })
      .withExposedPorts(9000)
      .start();
    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    store = new S3BlobStore({ endpoint, bucket: 'test', accessKeyId: 'minio', secretAccessKey: 'minio12345' });
    await store.ensureBucket();
  }, 120_000);
  afterAll(async () => {
    await minio?.stop();
  });

  it('putIfAbsent round-trips via getJson', async () => {
    const key = 'sha256/ab/abcdef.json';
    const put = await store.putIfAbsent(key, Buffer.from(JSON.stringify({ hello: 'world' })));
    expect(isOk(put)).toBe(true);
    const got = await store.getJson(key);
    expect(isOk(got) && (got.value as { hello: string }).hello).toBe('world');
  });
  it('presignedGet returns a URL', async () => {
    const key = 'sha256/cd/cdef01.json';
    await store.putIfAbsent(key, Buffer.from('{}'));
    const url = await store.presignedGet(key, 60);
    expect(isOk(url) && url.value).toMatch(/^http/);
  });
});
