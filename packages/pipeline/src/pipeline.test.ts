import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, articles, rawEvents, documents, reviewQueue, companies, companyEvents, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { KapAdapter, ResmiGazeteAdapter, type SourceAdapter, type RawEvent } from "@kaynak/sources";
import { ingestEvents, processPending, keywordOverlap, companyRefsOf, type Agents, type Outcome } from "./pipeline.js";
import { fakeAgents } from "./fakeAgents.js";
import { MemoryStore } from "./storage.js";
import { makeSlug, slugify } from "./slug.js";
import { pathsFor } from "./publish.js";

const FIX = new URL("../../agents/fixtures/resmi-gazete/", import.meta.url);
const html = readFileSync(new URL("../../sources/fixtures/day-2025-09-26.html", import.meta.url), "utf8");
const PAGE = "https://www.resmigazete.gov.tr/eskiler/2025/09/20250926.htm";
const docMap: Record<string, string> = { "20250926-1": "01-organ-nakli", "20250926-2": "05-kirsehir-merkez", "20250926-3": "04-kilis-doner-sermaye", "20250926-4": "06-kgk-kurul-karari" };

function offlineAdapter(rg: ResmiGazeteAdapter): SourceAdapter {
  return {
    id: rg.id, official: true, schedule: () => rg.schedule(), fetchNew: async () => [],
    async fetchDocument(ev: RawEvent) {
      const text = readFileSync(new URL(`${docMap[ev.externalId]}/document.txt`, FIX), "utf8");
      return { url: ev.url, mime: "text/html", bytes: Buffer.from(`<html><body><pre>${text}</pre></body></html>`) };
    },
  };
}

let h: DbHandle;
const rg = new ResmiGazeteAdapter();
beforeAll(async () => { h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
afterAll(async () => { await h.close(); });

describe("uçtan uca: fihrist → raw_events → belge → makale", () => {
  let events: RawEvent[];
  let outcomes: Outcome[];
  it("ingest dedupe yapar", async () => {
    events = rg.eventsFromHtml(html, PAGE);
    expect(events).toHaveLength(4);
    const first = await ingestEvents(h.db, events);
    expect(first).toHaveLength(4);
    const again = await ingestEvents(h.db, events);
    expect(again).toHaveLength(0);
  });
  it("sahte ajanlarla işler: üniversite maddeleri skipped, diğerleri published", async () => {
    const store = new MemoryStore();
    outcomes = await processPending({ db: h.db, agents: fakeAgents, store, reviewThreshold: 4, sourceNames: { "resmi-gazete": "T.C. Resmî Gazete" } }, offlineAdapter(rg));
    const kinds = outcomes.map((o) => o.kind).sort();
    // Üniversite maddeleri isNews=false → skipped. Diğer ikisi yayınlanır ya da kural motoru (ör. kısa KGK kararı
    // sahte ajanla 120 kelimeye ulaşamaz) review'a düşürür; hiçbiri reddedilmez.
    expect(kinds.filter((k) => k === "skipped")).toHaveLength(2);
    expect(kinds).not.toContain("rejected");
    expect(kinds).toContain("published");
    expect(store.blobs.size).toBe(4); // belge her durumda saklanır
    const docs = await h.db.select().from(documents);
    expect(docs).toHaveLength(4);
    expect(docs.every((d) => d.textContent.length > 100)).toBe(true);
  });
  it("yayınlanan makale slug, keyFacts ve belge bağıyla kayıtlı", async () => {
    const pub = await h.db.select().from(articles).where(eq(articles.status, "published"));
    expect(pub.length).toBeGreaterThanOrEqual(1);
    for (const a of pub) {
      expect(a.slug).toMatch(/^[a-z0-9-]+-[a-z0-9]{6}$/);
      expect(a.publishedAt).toBeInstanceOf(Date);
      expect(a.documentId).toBeTruthy();
      expect(a.keyFacts.length).toBeGreaterThan(0);
      expect(pathsFor(a)).toContain(`/haber/${a.slug}`);
    }
    const rows = await h.db.select().from(rawEvents);
    expect(rows.every((r) => r.status !== "new")).toBe(true);
    expect(rows.filter((r) => r.status === "skipped")).toHaveLength(2);
  });
  it("yüksek importance review kuyruğuna düşer", async () => {
    const highAgents: Agents = { ...fakeAgents, classify: async (i) => ({ ...(await fakeAgents.classify(i)), importance: 5, isNews: true }) };
    const ev = { ...events[0]!, externalId: "20250926M1-1", payloadHash: "mukerrer-hash" };
    await ingestEvents(h.db, [ev]);
    const adapter = offlineAdapter(rg);
    adapter.fetchDocument = async () => ({ url: ev.url, mime: "text/html", bytes: Buffer.from(`<html><body>${readFileSync(new URL("01-organ-nakli/document.txt", FIX), "utf8")}</body></html>`) });
    const [o] = await processPending({ db: h.db, agents: highAgents, store: new MemoryStore(), reviewThreshold: 4 }, adapter);
    expect(o?.kind).toBe("review");
    const q = await h.db.select().from(reviewQueue);
    expect(q.filter((r) => /importance 5/.test(r.reason))).toHaveLength(1);
  });
  it("uydurma sayı üreten ajan reddedilir ve rejected olarak kaydedilir", async () => {
    const liar: Agents = { ...fakeAgents, write: async (i) => { const w = await fakeAgents.write(i); return { ...w, dek: "Ceza 7.777.777 TL oldu.", numbersUsed: [...w.numbersUsed, "7.777.777"] }; } };
    const ev = { ...events[3]!, externalId: "20250926M2-1", payloadHash: "hash-liar" };
    await ingestEvents(h.db, [ev]);
    const adapter = offlineAdapter(rg);
    adapter.fetchDocument = async () => ({ url: ev.url, mime: "text/html", bytes: Buffer.from(`<html><body>${readFileSync(new URL("06-kgk-kurul-karari/document.txt", FIX), "utf8")}</body></html>`) });
    const [o] = await processPending({ db: h.db, agents: liar, store: new MemoryStore(), reviewThreshold: 4 }, adapter);
    expect(o?.kind).toBe("rejected");
    if (o?.kind === "rejected") expect(o.reasons[0]).toMatch(/7\.777\.777/);
  });
});

const KAP_FIX = new URL("../../agents/fixtures/kap/", import.meta.url);
const kapJson = JSON.parse(readFileSync(new URL("../../sources/fixtures/kap-disclosures.json", import.meta.url), "utf8"));
const kapDocMap: Record<string, string> = {
  "1400001": "01-pay-geri-alim", "1400002": "02-yeni-is-iliskisi", "1400003": "03-bedelsiz-sermaye-artirimi",
  "1400004": "04-genel-kurul-cagrisi", "1400005": "05-finansal-rapor", "1400006": "06-genel-bilgi-formu",
};
function offlineKap(k: KapAdapter): SourceAdapter {
  return {
    id: k.id, official: true, schedule: () => k.schedule(), fetchNew: async () => [],
    async fetchDocument(ev: RawEvent) {
      const text = readFileSync(new URL(`${kapDocMap[ev.externalId]}/document.txt`, KAP_FIX), "utf8");
      return { url: ev.url, mime: "text/html", bytes: Buffer.from(`<html><body><pre>${text}</pre></body></html>`) };
    },
  };
}

describe("KAP uçtan uca: bildirim listesi → şirketler → haber / bildirim geçmişi (Faz 2 kabul)", () => {
  const k = new KapAdapter();
  let outcomes: Outcome[];
  it("6 bildirim ingest edilir; fon ve eski KAP kayıtları elenmiştir", async () => {
    const events = k.eventsFromJson(kapJson);
    expect(events).toHaveLength(6);
    expect(await ingestEvents(h.db, events)).toHaveLength(6);
    expect(companyRefsOf(events.find((e) => e.externalId === "1400002")!.payload).map((c) => c.code)).toEqual(["DEMHO", "DEMLJ"]);
  });
  it("rutin bildirim (genel bilgi formu) haber olmaz, diğerleri haberleşir; yüksek önem review'a düşer", async () => {
    const published: { slug: string; sourceId: string }[] = [];
    outcomes = await processPending({
      db: h.db, agents: fakeAgents, store: new MemoryStore(), reviewThreshold: 4,
      onPublished: async (a, ctx) => { published.push({ slug: a.slug, sourceId: ctx.sourceId }); },
    }, offlineKap(k));
    const kinds = outcomes.map((o) => o.kind);
    expect(kinds.filter((x) => x === "skipped")).toHaveLength(1);
    expect(kinds).not.toContain("rejected");
    expect(kinds.filter((x) => x === "published").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("review"); // bedelsiz sermaye artırımı: importance 4
    expect(published.every((p) => p.sourceId === "kap")).toBe(true);
    expect(pathsFor({ tickers: ["ORNEK"], slug: "x", category: "borsa", publishedAt: new Date() } as unknown as Parameters<typeof pathsFor>[0], "kap"))
      .toEqual(["/", "/haber/x", "/kategori/borsa", "/rss.xml", "/news-sitemap.xml", "/sitemap.xml", "/sirket/ornek", "/sirket"]);
  });
  it("companies upsert edilir; company_events isNews=false dahil bildirim geçmişini tutar", async () => {
    const cos = await h.db.select().from(companies);
    expect(cos.map((c) => c.kapCode).sort()).toEqual(["DEMHO", "DEMLJ", "MISAL", "ORNEK"]);
    expect(cos.find((c) => c.kapCode === "ORNEK")?.name).toBe("ÖRNEK ENERJİ A.Ş.");
    expect(cos.find((c) => c.kapCode === "ORNEK")?.slug).toBe("ornek");
    const evs = await h.db.select({ code: companyEvents.kapCode, isNews: companyEvents.isNews, articleId: companyEvents.articleId, externalId: rawEvents.externalId })
      .from(companyEvents).innerJoin(rawEvents, eq(rawEvents.id, companyEvents.rawEventId));
    expect(evs).toHaveLength(7); // 6 bildirim, biri iki kodlu
    const routine = evs.find((e) => e.externalId === "1400006")!;
    expect(routine.isNews).toBe(false);
    expect(routine.articleId).toBeNull();
    for (const e of evs.filter((e) => e.externalId !== "1400006")) { expect(e.isNews).toBe(true); expect(e.articleId).toBeTruthy(); }
    expect(evs.filter((e) => e.externalId === "1400002").map((e) => e.code).sort()).toEqual(["DEMHO", "DEMLJ"]);
  });
  it("haberin tickers alanı şirket kodlarını içerir; isNews=false raw_event skipped kalır", async () => {
    const kapArticles = await h.db.select().from(articles).where(eq(articles.category, "borsa"));
    expect(kapArticles.length).toBe(5);
    const multi = kapArticles.find((a) => a.tickers.includes("DEMLJ"))!;
    expect(multi.tickers).toEqual(expect.arrayContaining(["DEMHO", "DEMLJ"]));
    expect(kapArticles.every((a) => a.tickers.length > 0)).toBe(true);
    const [skipped] = await h.db.select().from(rawEvents).where(eq(rawEvents.externalId, "1400006"));
    expect(skipped?.status).toBe("skipped");
    // Aynı listeyi tekrar ingest etmek yeni satır üretmez (dedupe) ve şirket olayı çoğalmaz
    expect(await ingestEvents(h.db, k.eventsFromJson(kapJson))).toHaveLength(0);
  });
});

describe("yardımcılar", () => {
  it("slugify Türkçe karakterleri çevirir", () => {
    expect(slugify("Tüketici cezalarında uzlaşma: İl müdürlüklerine yetki")).toBe("tuketici-cezalarinda-uzlasma-il-mudurluklerine-yetki");
    expect(makeSlug("Başlık", "abc123")).toBe("baslik-abc123");
  });
  it("keywordOverlap başlık–belge örtüşmesini sayar", () => {
    expect(keywordOverlap("Organ Nakli Hizmetleri Yönetmeliğinde Değişiklik", "Organ Nakli Hizmetleri Yönetmeliğinin üçüncü bölümü")).toBeGreaterThanOrEqual(2);
    expect(keywordOverlap("Organ Nakli Hizmetleri", "Bankacılık Kanunu hükümleri")).toBe(0);
  });
});
