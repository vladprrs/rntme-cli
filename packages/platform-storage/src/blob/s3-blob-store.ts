import { Buffer } from 'node:buffer';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ok, err, type BlobStore, type Result, type PlatformError } from '@rntme-cli/platform-core';

export type S3BlobStoreOpts = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
};

export class S3BlobStore implements BlobStore {
  private readonly client: S3Client;
  constructor(private readonly opts: S3BlobStoreOpts) {
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region ?? 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.opts.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.opts.bucket }));
    }
  }

  async putIfAbsent(key: string, body: Buffer): Promise<Result<void, PlatformError>> {
    try {
      try {
        await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
        return ok(undefined);
      } catch {
        /* not present, fall through */
      }
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.opts.bucket,
          Key: key,
          Body: body,
          ContentType: 'application/json',
        }),
      );
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_BLOB_UPLOAD_FAILED', message: String(cause), cause }]);
    }
  }

  async presignedGet(key: string, expiresSeconds: number): Promise<Result<string, PlatformError>> {
    try {
      const cmd = new GetObjectCommand({ Bucket: this.opts.bucket, Key: key });
      const url = await getSignedUrl(this.client, cmd, { expiresIn: expiresSeconds });
      return ok(url);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_BLOB_UPLOAD_FAILED', message: String(cause), cause }]);
    }
  }

  async getJson<T = unknown>(key: string): Promise<Result<T, PlatformError>> {
    const raw = await this.getRaw(key);
    if (!raw.ok) return raw;
    try {
      return ok(JSON.parse(raw.value.toString('utf8')) as T);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_BLOB_UPLOAD_FAILED', message: String(cause), cause }]);
    }
  }

  async getRaw(key: string): Promise<Result<Buffer, PlatformError>> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return ok(Buffer.from(bytes));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_BLOB_UPLOAD_FAILED', message: String(cause), cause }]);
    }
  }
}
