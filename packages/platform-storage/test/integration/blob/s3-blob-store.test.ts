import { Buffer } from 'node:buffer';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { S3BlobStore } from '../../../src/blob/s3-blob-store.js';
import { isOk } from '@rntme-cli/platform-core';
import { dockerAvailable } from '../docker-available.js';

const externalS3 = readExternalS3();

describe.skipIf(!externalS3 && !dockerAvailable())('S3BlobStore', () => {
  let minio: StartedTestContainer | undefined;
  let store: S3BlobStore;

  beforeAll(async () => {
    if (externalS3) {
      store = new S3BlobStore(externalS3);
    } else {
      minio = await new GenericContainer('minio/minio:latest')
        .withCommand(['server', '/data'])
        .withEnvironment({ MINIO_ROOT_USER: 'minio', MINIO_ROOT_PASSWORD: 'minio12345' })
        .withExposedPorts(9000)
        .start();
      const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
      store = new S3BlobStore({ endpoint, bucket: 'test', accessKeyId: 'minio', secretAccessKey: 'minio12345' });
    }
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

  it('getRaw round-trips arbitrary bytes', async () => {
    const key = 'raw/test.bin';
    const payload = Buffer.from([1, 2, 3, 4, 5, 0xff, 0x00]);
    const put = await store.putIfAbsent(key, payload);
    expect(isOk(put)).toBe(true);
    const got = await store.getRaw(key);
    expect(isOk(got)).toBe(true);
    if (isOk(got)) expect(Buffer.compare(got.value, payload)).toBe(0);
  });

  it('presignedGet returns a URL', async () => {
    const key = 'sha256/cd/cdef01.json';
    await store.putIfAbsent(key, Buffer.from('{}'));
    const url = await store.presignedGet(key, 60);
    expect(isOk(url) && url.value).toMatch(/^http/);
  });
});

function readExternalS3(): ConstructorParameters<typeof S3BlobStore>[0] | null {
  const endpoint = process.env['PLATFORM_TEST_S3_ENDPOINT'];
  const bucket = process.env['PLATFORM_TEST_S3_BUCKET'];
  const accessKeyId = process.env['PLATFORM_TEST_S3_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['PLATFORM_TEST_S3_SECRET_ACCESS_KEY'];
  if (!endpoint && !bucket && !accessKeyId && !secretAccessKey) return null;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Set PLATFORM_TEST_S3_ENDPOINT, PLATFORM_TEST_S3_BUCKET, PLATFORM_TEST_S3_ACCESS_KEY_ID, and PLATFORM_TEST_S3_SECRET_ACCESS_KEY together.',
    );
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}
