import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';

/** Object storage for customer artwork. Keys are generated server-side only. */
export interface ArtworkStorage {
  readonly kind: 'local' | 's3';
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

/** Development adapter: files under LOCAL_STORAGE_DIR (default ./storage). Not durable on PaaS disks. */
export class LocalDiskStorage implements ArtworkStorage {
  readonly kind = 'local' as const;
  private readonly root: string;

  constructor(dir = process.env.LOCAL_STORAGE_DIR ?? './storage') {
    this.root = resolve(dir);
  }

  private path(key: string): string {
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return p;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
    await writeFile(`${p}.type`, contentType);
  }

  async get(key: string) {
    try {
      const p = this.path(key);
      const [bytes, contentType] = await Promise.all([readFile(p), readFile(`${p}.type`, 'utf8')]);
      return { bytes: new Uint8Array(bytes), contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const p = this.path(key);
    await rm(p, { force: true });
    await rm(`${p}.type`, { force: true });
  }
}

/** Production adapter for AWS S3 or any S3-compatible store (Cloudflare R2, MinIO…). Bucket must be private. */
export class S3Storage implements ArtworkStorage {
  readonly kind = 's3' as const;
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: S3ClientConfig,
  ) {
    this.client = new S3Client(config);
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: 'private, no-store',
        ServerSideEncryption: process.env.S3_SSE === 'off' ? undefined : 'AES256',
      }),
    );
  }

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      return {
        bytes: new Uint8Array(await res.Body.transformToByteArray()),
        contentType: res.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export class StorageConfigError extends Error {}

let instance: ArtworkStorage | null = null;

/**
 * STORAGE_DRIVER=s3 → S3Storage (requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY;
 * S3_ENDPOINT for R2/MinIO). Anything else → LocalDiskStorage, with a loud warning in production.
 */
export function getStorage(): ArtworkStorage {
  if (instance) return instance;
  if (process.env.STORAGE_DRIVER === 's3') {
    const missing = ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter(
      (k) => !process.env[k],
    );
    if (missing.length)
      throw new StorageConfigError(`S3 storage is not configured: missing ${missing.join(', ')}`);
    instance = new S3Storage(process.env.S3_BUCKET!, {
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  } else {
    if (process.env.NODE_ENV === 'production')
      console.warn(
        '[embroidery] STORAGE_DRIVER is not "s3": artwork is stored on local disk, which is NOT durable in production.',
      );
    instance = new LocalDiskStorage();
  }
  return instance;
}

/** Test seam. */
export function setStorageForTests(storage: ArtworkStorage | null): void {
  instance = storage;
}
