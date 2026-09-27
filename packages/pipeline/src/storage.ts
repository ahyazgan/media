import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Belge baytları için depo. MVP: yerel disk (STORAGE_DIR). S3/MinIO ayarlıysa oraya yazacak
 * sürücü Faz 3'te eklenecek; arayüz aynı kalır.
 */
export interface BlobStore {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
}

export class DiskStore implements BlobStore {
  constructor(private readonly dir: string) {}
  async put(key: string, bytes: Buffer): Promise<void> {
    const path = join(this.dir, key);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, bytes);
  }
}

export class MemoryStore implements BlobStore {
  readonly blobs = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer): Promise<void> { this.blobs.set(key, bytes); }
}

export function storageKeyFor(sourceId: string, externalId: string, mime: string): string {
  const ext = mime.includes("pdf") ? "pdf" : "html";
  return `${sourceId}/${externalId.slice(0, 4)}/${externalId}.${ext}`;
}
