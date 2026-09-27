import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, articles, rawEvents, documents, reviewQueue, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { ResmiGazeteAdapter, type SourceAdapter, type RawEvent } from "@kaynak/sources";
import { ingestEvents, processPending, keywordOverlap, type Agents, type Outcome } from "./pipeline.js";
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
