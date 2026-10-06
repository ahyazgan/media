import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, articles, articleVersions, rawEvents, reviewQueue, type DbHandle, type Article } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import type { RawEvent, SourceAdapter } from "@kaynak/sources";
import type { ClassifyOutput, FlashOutput, WriteOutput } from "@kaynak/agents";
import { ingestEvents, processEvent, type Agents, type PipelineDeps } from "./pipeline.js";
import { publishFromReview, rejectFromReview } from "./editorial.js";
import { MemoryStore } from "./storage.js";

const DOC = `Para Politikası Kurulu (Kurul), politika faizi olan bir hafta vadeli repo ihale faiz oranını yüzde 36,5'ten yüzde 35'e indirmiştir.
Kurul, enflasyonun ana eğiliminin Eylül ayında gerilediğini değerlendirmiştir. Kurul, para politikası duruşunu fiyat istikrarı hedefi doğrultusunda belirlemeye devam edecektir.
Toplantı özeti beş iş günü içinde yayımlanacaktır.`;

const body = Array.from({ length: 14 }, () => "Para Politikası Kurulu politika faizini indirdiğini açıkladı ve kararın gerekçesini paylaştı.").join(" ");
const goodFlash: FlashOutput = { headline: "TCMB politika faizini yüzde 35'e indirdi", sentence: "Para Politikası Kurulu bir hafta vadeli repo ihale faiz oranını yüzde 36,5'ten yüzde 35'e indirdi.", numbersUsed: ["35", "36,5"] };
const goodFull: WriteOutput = {
  title: "TCMB politika faizini yüzde 35'e indirdi", dek: "Kurul faizi yüzde 36,5'ten yüzde 35'e çekti.", bodyMarkdown: body + " Faiz yüzde 35 oldu.",
  keyFacts: [{ text: "Faiz yüzde 35", quoteFromSource: "yüzde 36,5'ten yüzde 35'e indirmiştir" }], tickers: [], tags: ["tcmb", "faiz"], numbersUsed: ["35", "36,5"],
};
const cls = (importance: number): ClassifyOutput => ({ category: "makro", importance, entities: { companies: [], tickers: [], institutions: ["TCMB"] }, isNews: true, summaryHint: "Faiz indirimi." });

let h: DbHandle;
beforeAll(async () => { h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
afterAll(async () => { await h.close(); });

let n = 0;
async function run(opts: { importance: number; threshold: number; flash?: FlashOutput; full?: WriteOutput }) {
  const ev: RawEvent = { sourceId: "tcmb", externalId: `duy-flash-${++n}`, title: "Faiz Oranlarına İlişkin Basın Duyurusu (Para Politikası Kurulu)", url: `https://www.tcmb.gov.tr/x/${n}`, publishedAt: new Date(), payloadHash: `h${n}`, payload: { section: "ppk" } };
  const [row] = await ingestEvents(h.db, [ev]);
  const calls = { published: [] as Article[], updated: [] as Article[] };
  const agents: Agents = {
    classify: async () => cls(opts.importance),
    write: async () => opts.full ?? goodFull,
    flash: async () => opts.flash ?? goodFlash,
  };
  const adapter: SourceAdapter = { id: "tcmb", official: true, schedule: () => ({ timezone: "Europe/Istanbul", windows: [], defaultEverySeconds: 600 }), fetchNew: async () => [], fetchDocument: async (e) => ({ url: e.url, mime: "text/html", bytes: Buffer.from(`<html><body><pre>${DOC}</pre></body></html>`) }) };
  const deps: PipelineDeps = {
    db: h.db, agents, store: new MemoryStore(), reviewThreshold: opts.threshold, flash: { sources: ["tcmb"], minImportance: 4 },
    onPublished: async (a) => { calls.published.push(a); }, onUpdated: async (a) => { calls.updated.push(a); },
  };
  const outcome = await processEvent(deps, adapter, row!);
  const arts = await h.db.select().from(articles).where(eq(articles.rawEventId, row!.id));
  return { outcome, arts, calls };
}

describe("flaş → tam metin (aynı makale)", () => {
  it("tam metin otomatik yayımlanırsa flaş yerinde güncellenir; dağıtım bir kez, sürüm geçmişi iki adım", async () => {
    const { outcome, arts, calls } = await run({ importance: 4, threshold: 6 });
    expect(outcome.kind).toBe("published");
    expect(arts).toHaveLength(1);
    expect(arts[0]!.isFlash).toBe(false);
    expect(arts[0]!.bodyMarkdown).toContain("Faiz yüzde 35 oldu.");
    expect(calls.published.map((a) => a.isFlash)).toEqual([true]);
    expect(calls.updated).toHaveLength(1);
    const vs = await h.db.select().from(articleVersions).where(eq(articleVersions.articleId, arts[0]!.id));
    expect(vs.map((v) => v.reason).sort()).toEqual(["flaş (otomatik)", "tam metin (otomatik, flaşın yerine)"]);
  });

  it("tam metin onay gerektirirse flaş yayında kalır, taslak pendingDraft'ta; editör onayı flaşın yerine koyar", async () => {
    const { outcome, arts, calls } = await run({ importance: 5, threshold: 4 });
    expect(outcome.kind).toBe("review");
    expect(arts).toHaveLength(1);
    const a = arts[0]!;
    expect(a).toMatchObject({ status: "published", isFlash: true, title: goodFlash.headline });
    expect(a.pendingDraft?.bodyMarkdown).toContain("Faiz yüzde 35 oldu.");
    expect(calls.published).toHaveLength(1);
    const [q] = await h.db.select().from(reviewQueue).where(eq(reviewQueue.articleId, a.id));
    expect(q?.reason).toMatch(/^flaş yayında/);
    const done = await publishFromReview(h.db, a.id, { by: "editör" });
    expect(done).toMatchObject({ status: "published", isFlash: false, pendingDraft: null, dek: goodFull.dek });
    expect(done.publishedAt?.getTime()).toBe(a.publishedAt?.getTime());
  });

  it("belgede olmayan sayılı flaş yayımlanmaz; akış normal devam eder", async () => {
    const { outcome, arts, calls } = await run({ importance: 5, threshold: 4, flash: { ...goodFlash, sentence: "Kurul faizi yüzde 34'e indirdi.", numbersUsed: ["34"] } });
    expect(outcome.kind).toBe("review");
    expect(arts).toHaveLength(1);
    expect(arts[0]).toMatchObject({ status: "review", isFlash: false });
    expect(calls.published).toHaveLength(0);
  });

  it("aynı olay aynı anda iki kez işlenmeye çalışılırsa (izleme + bekleyen süpürmesi) yalnızca biri işler: tek flaş, tek dağıtım", async () => {
    const ev: RawEvent = { sourceId: "tcmb", externalId: `duy-flash-${++n}`, title: "Faiz Oranlarına İlişkin Basın Duyurusu (Para Politikası Kurulu)", url: `https://www.tcmb.gov.tr/x/${n}`, publishedAt: new Date(), payloadHash: `h${n}`, payload: {} };
    const [row] = await ingestEvents(h.db, [ev]);
    const published: Article[] = [];
    const agents: Agents = { classify: async () => cls(5), write: async () => goodFull, flash: async () => goodFlash };
    const adapter: SourceAdapter = { id: "tcmb", official: true, schedule: () => ({ timezone: "Europe/Istanbul", windows: [], defaultEverySeconds: 600 }), fetchNew: async () => [], fetchDocument: async (e) => ({ url: e.url, mime: "text/html", bytes: Buffer.from(`<html><body><pre>${DOC}</pre></body></html>`) }) };
    const deps: PipelineDeps = { db: h.db, agents, store: new MemoryStore(), reviewThreshold: 6, flash: { sources: ["tcmb"], minImportance: 4 }, onPublished: async (a) => { published.push(a); }, onUpdated: async () => {} };
    const outcomes = await Promise.all([processEvent(deps, adapter, row!), processEvent(deps, adapter, row!)]);
    expect(outcomes.map((o) => o.kind).sort()).toEqual(["published", "skipped"]);
    expect(await h.db.select().from(articles).where(eq(articles.rawEventId, row!.id))).toHaveLength(1);
    expect(published).toHaveLength(1);
    // İşlenmiş olay tekrar alınmaz
    expect((await processEvent(deps, adapter, row!)).kind).toBe("skipped");
  });

  it("flaş yayımlandıktan sonra yazım düşerse sahiplenme boşalır; yeniden deneme aynı flaşı kullanır (ikinci flaş ve dağıtım yok)", async () => {
    const ev: RawEvent = { sourceId: "tcmb", externalId: `duy-flash-${++n}`, title: "Faiz Oranlarına İlişkin Basın Duyurusu (Para Politikası Kurulu)", url: `https://www.tcmb.gov.tr/x/${n}`, publishedAt: new Date(), payloadHash: `h${n}`, payload: {} };
    const [row] = await ingestEvents(h.db, [ev]);
    const published: Article[] = [];
    let writes = 0;
    const agents: Agents = {
      classify: async () => cls(5), flash: async () => goodFlash,
      write: async () => { if (++writes === 1) throw new Error("API 529 overloaded"); return goodFull; },
    };
    const adapter: SourceAdapter = { id: "tcmb", official: true, schedule: () => ({ timezone: "Europe/Istanbul", windows: [], defaultEverySeconds: 600 }), fetchNew: async () => [], fetchDocument: async (e) => ({ url: e.url, mime: "text/html", bytes: Buffer.from(`<html><body><pre>${DOC}</pre></body></html>`) }) };
    const deps: PipelineDeps = { db: h.db, agents, store: new MemoryStore(), reviewThreshold: 6, flash: { sources: ["tcmb"], minImportance: 4 }, onPublished: async (a) => { published.push(a); }, onUpdated: async () => {} };
    await expect(processEvent(deps, adapter, row!)).rejects.toThrow(/529/);
    const [mid] = await h.db.select().from(rawEvents).where(eq(rawEvents.id, row!.id));
    expect(mid!.claimedAt).toBeNull();
    expect((await processEvent(deps, adapter, row!)).kind).toBe("published");
    const arts = await h.db.select().from(articles).where(eq(articles.rawEventId, row!.id));
    expect(arts).toHaveLength(1);
    expect(arts[0]).toMatchObject({ isFlash: false, title: goodFull.title });
    expect(published.map((a) => a.isFlash)).toEqual([true]);
  });

  it("önem eşiğin altındaysa flaş üretilmez", async () => {
    const { arts, calls } = await run({ importance: 3, threshold: 6 });
    expect(arts).toHaveLength(1);
    expect(arts[0]!.isFlash).toBe(false);
    expect(calls.published.map((a) => a.isFlash)).toEqual([false]);
  });

  it("tam metin reddedilirse flaş yayında kalır ve kuyruğa düşer; editör reddi flaşı korur", async () => {
    const { outcome, arts } = await run({ importance: 5, threshold: 4, full: { ...goodFull, dek: "Faiz yüzde 33'e indi." } });
    expect(outcome.kind).toBe("rejected");
    const flash = arts.find((a) => a.isFlash)!;
    expect(flash.status).toBe("published");
    expect(arts.find((a) => a.status === "rejected")).toBeTruthy();
    const kept = await rejectFromReview(h.db, flash.id, { by: "editör", reason: "tam metin gerekmiyor" });
    expect(kept).toMatchObject({ status: "published", isFlash: true });
    const [ev] = await h.db.select().from(rawEvents).where(eq(rawEvents.id, flash.rawEventId!));
    expect(ev?.status).toBe("processed");
  });
});
