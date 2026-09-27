import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createStore, DiskStore, S3Store, storageKeyFor, type S3Like } from "./storage.js";

describe("depo", () => {
  it("DiskStore yazar ve okur", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kaynak-store-"));
    const s = new DiskStore(dir);
    await s.put("a/b/c.html", Buffer.from("<p>x</p>"), "text/html");
    expect((await s.get("a/b/c.html"))?.toString()).toBe("<p>x</p>");
    expect(await s.get("yok")).toBeUndefined();
  });
  it("S3Store PutObject/GetObject komutlarını doğru parametrelerle gönderir; ön ek uygular", async () => {
    const sent: unknown[] = [];
    const fake: S3Like = {
      async send(cmd) {
        sent.push(cmd);
        if (cmd instanceof GetObjectCommand) {
          if (cmd.input.Key === "docs/yok") throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
          return { Body: { transformToByteArray: async () => new Uint8Array(Buffer.from("%PDF-1.4")) } };
        }
        return {};
      },
    };
    const s = new S3Store(fake, { bucket: "kaynak", prefix: "docs/" });
    await s.put("resmi-gazete/2026/x.pdf", Buffer.from("%PDF-1.4"), "application/pdf");
    const put = sent[0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({ Bucket: "kaynak", Key: "docs/resmi-gazete/2026/x.pdf", ContentType: "application/pdf" });
    expect((await s.get("resmi-gazete/2026/x.pdf"))?.toString()).toBe("%PDF-1.4");
    expect(await s.get("yok")).toBeUndefined();
  });
  it("createStore: S3 ayarları yoksa disk, varsa S3", async () => {
    expect(await createStore({ STORAGE_DIR: "/tmp/x" })).toBeInstanceOf(DiskStore);
    expect(await createStore({ STORAGE_DIR: "/tmp/x", S3_BUCKET: "b", S3_ACCESS_KEY: "a", S3_SECRET_KEY: "s", S3_ENDPOINT: "http://localhost:9000" })).toBeInstanceOf(S3Store);
  });
  it("storageKeyFor", () => expect(storageKeyFor("kap", "1400001", "text/html")).toBe("kap/1400/1400001.html"));
});
