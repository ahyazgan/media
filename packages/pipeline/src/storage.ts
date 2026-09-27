import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type * as S3 from "@aws-sdk/client-s3";

/**
 * Belge baytları için depo. `DiskStore` (STORAGE_DIR) geliştirme varsayılanı; `S3Store` MinIO/S3 (S3_* ayarlıysa `createStore`
 * seçer). Arayüz aynıdır; belge metni her durumda Postgres'te (documents.text_content) tutulur.
 */
export interface BlobStore {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  /** Yalnızca admin/denetim için; büyük dosyalar için akış gerekmez (belgeler birkaç MB). */
  get?(key: string): Promise<Buffer | undefined>;
}

export class DiskStore implements BlobStore {
  constructor(private readonly dir: string) {}
  async put(key: string, bytes: Buffer, _mime?: string): Promise<void> {
    const path = join(this.dir, key);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, bytes);
  }
  async get(key: string): Promise<Buffer | undefined> {
    try { return await readFile(join(this.dir, key)); } catch { return undefined; }
  }
}

export class MemoryStore implements BlobStore {
  readonly blobs = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer, _mime?: string): Promise<void> { this.blobs.set(key, bytes); }
  async get(key: string): Promise<Buffer | undefined> { return this.blobs.get(key); }
}

/** @aws-sdk/client-s3 istemcisinin kullanılan alt kümesi (testte sahte istemci enjekte edilir). */
export interface S3Like {
  send(command: unknown): Promise<unknown>;
}
export interface S3StoreOptions { bucket: string; prefix?: string }

export class S3Store implements BlobStore {
  private cmds?: Promise<typeof S3>;
  constructor(private readonly client: S3Like, private readonly opts: S3StoreOptions) {}
  private key(k: string) { return this.opts.prefix ? `${this.opts.prefix.replace(/\/$/, "")}/${k}` : k; }
  private sdk() { return (this.cmds ??= import("@aws-sdk/client-s3")); }
  async put(key: string, bytes: Buffer, mime: string): Promise<void> {
    const { PutObjectCommand } = await this.sdk();
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: this.key(key), Body: bytes, ContentType: mime, CacheControl: "private, max-age=31536000" }));
  }
  async get(key: string): Promise<Buffer | undefined> {
    const { GetObjectCommand } = await this.sdk();
    try {
      const out = (await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: this.key(key) }))) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
      return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : undefined;
    } catch (e) { if ((e as { name?: string }).name === "NoSuchKey") return undefined; throw e; }
  }
}

export interface StoreEnv { STORAGE_DIR: string; S3_ENDPOINT?: string; S3_BUCKET?: string; S3_ACCESS_KEY?: string; S3_SECRET_KEY?: string; S3_REGION?: string; S3_PREFIX?: string }

/** S3_BUCKET + erişim anahtarları tanımlıysa S3/MinIO (path-style, MinIO uyumlu); değilse disk. */
export async function createStore(env: StoreEnv): Promise<BlobStore> {
  if (env.S3_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: env.S3_REGION ?? "us-east-1",
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(env.S3_ENDPOINT), // MinIO ve özel uç noktalar
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
    return new S3Store(client, { bucket: env.S3_BUCKET, prefix: env.S3_PREFIX });
  }
  return new DiskStore(env.STORAGE_DIR);
}

export function storageKeyFor(sourceId: string, externalId: string, mime: string): string {
  const ext = mime.includes("pdf") ? "pdf" : "html";
  return `${sourceId}/${externalId.slice(0, 4)}/${externalId}.${ext}`;
}
