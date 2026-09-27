import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, articles, jobFailures, metricsDaily, rawEvents, reviewQueue, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { publishCorrection, publishFromReview, rejectFromReview, retractArticle, snapshotArticle, versionsOf } from "./editorial.js";
import { computeDailyMetrics, dashboardCounts, persistDailyMetrics } from "./metrics.js";
import { recordFailure, retryFailure } from "./failures.js";
import { istanbulDate } from "./newsletter.js";

let h: DbHandle;
beforeAll(async () => { h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
afterAll(async () => { await h.close(); });

// Kuyruk/sürüm kayıtları "şimdi" oluştuğundan ölçüt günü bugündür (Türkiye saati)
const DAY = istanbulDate(new Date());
async function mkEvent(externalId: string, publishedAt: Date, status: "new" | "processed" | "skipped" = "processed") {
  const [ev] = await h.db.insert(rawEvents).values({ sourceId: "resmi-gazete", externalId, title: externalId, url: `https://rg.test/${externalId}`, publishedAt, payloadHash: externalId, status }).returning();
  return ev!;
}
async function mkArticle(slug: string, status: "review" | "published" | "rejected", opts: { rawEventId?: string; publishedAt?: Date; createdAt?: Date; importance?: number; editorNote?: string } = {}) {
  const [a] = await h.db.insert(articles).values({
    slug, status, category: "mevzuat", importance: opts.importance ?? 3, title: `Başlık ${slug}`, dek: "Dek", bodyMarkdown: "Gövde", keyFacts: [{ text: "o", quoteFromSource: "a" }],
    sourceUrl: "https://rg.test/x", rawEventId: opts.rawEventId, publishedAt: opts.publishedAt ?? null, createdAt: opts.createdAt ?? new Date(`${DAY}T09:00:00+03:00`), updatedAt: opts.createdAt ?? new Date(), editorNote: opts.editorNote ?? null,
  }).returning();
  return a!;
}

describe("inceleme kuyruğu", () => {
  it("yayınla: durum published, kuyruk çözülür, v1 anlık görüntü; düzenleme uygulanır", async () => {
    const ev = await mkEvent("rg-1", new Date(`${DAY}T06:00:00+03:00`));
    const a = await mkArticle("inceleme-1", "review", { rawEventId: ev.id, importance: 5 });
    await h.db.insert(reviewQueue).values({ articleId: a.id, reason: "importance 5" });
    const pub = await publishFromReview(h.db, a.id, { by: "editor", patch: { title: "Düzenlenmiş başlık" } });
    expect(pub.status).toBe("published");
    expect(pub.title).toBe("Düzenlenmiş başlık");
    expect(pub.publishedAt).toBeInstanceOf(Date);
    const [q] = await h.db.select().from(reviewQueue).where(eq(reviewQueue.articleId, a.id));
    expect(q?.resolvedBy).toBe("editor");
    const v = await versionsOf(h.db, a.id);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ version: 1 });
    expect((v[0]!.snapshot as { title: string }).title).toBe("Düzenlenmiş başlık");
    await expect(publishFromReview(h.db, a.id, { by: "editor" })).rejects.toThrow(/yayınlanamaz/);
  });
  it("reddet: rejected + not; kuyruk çözülür", async () => {
    const a = await mkArticle("inceleme-2", "review");
    await h.db.insert(reviewQueue).values({ articleId: a.id, reason: "uzunluk" });
    const r = await rejectFromReview(h.db, a.id, { by: "editor", reason: "belgeyle uyumsuz" });
    expect(r.status).toBe("rejected");
    expect(r.editorNote).toContain("belgeyle uyumsuz");
    expect((await h.db.select().from(reviewQueue).where(eq(reviewQueue.articleId, a.id)))[0]?.resolvedAt).toBeInstanceOf(Date);
  });
});

describe("düzeltme ve geri çekme", () => {
  it("düzeltme: önceki hâl sürümlenir, durum corrected, not gerekçe olur; değişiklik yoksa hata", async () => {
    const ev = await mkEvent("rg-2", new Date(`${DAY}T06:00:00+03:00`));
    const a = await mkArticle("duzeltme-1", "published", { rawEventId: ev.id, publishedAt: new Date(`${DAY}T06:07:00+03:00`) });
    await snapshotArticle(h.db, a, "ilk yayın (otomatik)");
    await expect(publishCorrection(h.db, a.id, { title: a.title }, { by: "editor", reason: "x" })).rejects.toThrow(/değişiklik yok/);
    await expect(publishCorrection(h.db, a.id, { dek: "Yeni dek" }, { by: "editor", reason: "  " })).rejects.toThrow(/gerekçe/);
    const c = await publishCorrection(h.db, a.id, { dek: "Yeni dek" }, { by: "editor", reason: "Tutar yanlış yazılmıştı" });
    expect(c.status).toBe("corrected");
    expect(c.dek).toBe("Yeni dek");
    expect(c.editorNote).toBe("Tutar yanlış yazılmıştı");
    const v = await versionsOf(h.db, a.id);
    expect(v.map((x) => x.version)).toEqual([2, 1]);
    expect((v[1]!.snapshot as { dek: string }).dek).toBe("Dek");
    expect(v[0]!.reason).toMatch(/^düzeltme \(editor\)/);
  });
  it("sürümsüz eski makalede düzeltme önce geriye dönük v1 alır", async () => {
    const a = await mkArticle("duzeltme-2", "published", { publishedAt: new Date(`${DAY}T10:00:00+03:00`) });
    await publishCorrection(h.db, a.id, { title: "Yeni başlık" }, { by: "editor", reason: "başlık" });
    const v = await versionsOf(h.db, a.id);
    expect(v.map((x) => x.reason)).toEqual(["düzeltme (editor): başlık", "ilk yayın (geriye dönük anlık görüntü)"]);
  });
  it("geri çekme: retracted, içerik korunur, sürüm eklenir", async () => {
    const a = await mkArticle("geri-cek-1", "published", { publishedAt: new Date(`${DAY}T11:00:00+03:00`) });
    const r = await retractArticle(h.db, a.id, { by: "editor", reason: "Belge yürürlükten kaldırıldı" });
    expect(r.status).toBe("retracted");
    expect(r.bodyMarkdown).toBe("Gövde");
    expect((await versionsOf(h.db, a.id))[0]!.reason).toMatch(/^geri çekme/);
    await expect(retractArticle(h.db, a.id, { by: "editor", reason: "tekrar" })).rejects.toThrow(/geri çekilemez/);
  });
});

describe("ölçütler", () => {
  it("günlük ölçütler: süre yüzdelikleri yalnızca otomatik yayınlardan, sayımlar doğru", async () => {
    // otomatik yayın: kaynak 06:00 → yayın 06:07 (7 dk) ve 06:00 → 06:30 (30 dk); insan onaylı (inceleme-1) hariç
    const ev3 = await mkEvent("rg-3", new Date(`${DAY}T06:00:00+03:00`));
    await mkArticle("auto-2", "published", { rawEventId: ev3.id, publishedAt: new Date(`${DAY}T06:30:00+03:00`) });
    await mkEvent("rg-skip", new Date(`${DAY}T06:00:00+03:00`), "skipped");
    await mkArticle("red-1", "rejected", { editorNote: "numericGroundingCheck: belgede bulunamayan sayılar: 7.777" });
    const m = await computeDailyMetrics(h.db, DAY);
    expect(m.timeToPublishP50).toBe(7);
    expect(m.timeToPublishP95).toBe(30);
    // Bugün yayınlananlar: duzeltme-1 (06:07), auto-2 (06:30), duzeltme-2 (10:00), geri-cek-1 (11:00) + inceleme-1 (insan onaylı, şimdi)
    expect(m.published).toBe(5);
    expect(m.autoPublished).toBe(4);
    // süre yüzdelikleri yalnızca kaynağı (raw_event) bilinen otomatik yayınlardan: 7 ve 30 dk
    expect(m.reviewed).toBe(2);
    expect(m.rejected).toBe(2);            // inceleme-2 (insan) + red-1
    expect(m.groundingRejects).toBe(1);
    expect(m.skipped).toBe(1);
    expect(m.corrections).toBe(2);
    expect(m.retracted).toBe(1);
    await persistDailyMetrics(h.db, DAY);
    const [row] = await h.db.select().from(metricsDaily).where(eq(metricsDaily.date, DAY));
    expect(row).toMatchObject({ timeToPublishP50: 7, corrections: 2, retracted: 1, groundingRejects: 1 });
    const d = await dashboardCounts(h.db);
    expect(d.openReviews).toBe(0);
    expect(d.corrected).toBe(2);
  });
});

describe("iş hataları", () => {
  it("kaydet → yeniden dene: raw_event new'e döner, kayıt çözülür", async () => {
    const ev = await mkEvent("rg-fail", new Date(), "processed");
    await recordFailure(h.db, { queue: "process", rawEventId: ev.id, sourceId: "resmi-gazete", error: "boom", attempts: 3 });
    const [f] = await h.db.select().from(jobFailures);
    expect(f?.attempts).toBe(3);
    await retryFailure(h.db, f!.id, "editor");
    expect((await h.db.select().from(rawEvents).where(eq(rawEvents.id, ev.id)))[0]?.status).toBe("new");
    expect((await h.db.select().from(jobFailures))[0]?.resolvedAt).toBeInstanceOf(Date);
    expect((await dashboardCounts(h.db)).pendingEvents).toBe(1);
  });
});
