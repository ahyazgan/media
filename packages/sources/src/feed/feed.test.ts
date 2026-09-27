import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { externalIdFor, parseFeed, parseFeedDate } from "./parse.js";
import { TcmbAdapter, tcmbSection } from "../tcmb.js";
import { TuikAdapter, tuikSection } from "../tuik.js";
import { intervalFor } from "../types.js";
import { _resetHttpState } from "../http.js";

const tcmbXml = readFileSync(new URL("../../fixtures/tcmb-basin.xml", import.meta.url), "utf8");
const tuikXml = readFileSync(new URL("../../fixtures/tuik-bulten.xml", import.meta.url), "utf8");

describe("parseFeed", () => {
  it("RSS 2.0: başlık, bağlantı, tarih, özet (HTML temizlenmiş)", () => {
    const items = parseFeed(tcmbXml);
    expect(items).toHaveLength(3);
    expect(items[0]!.title).toBe("Faiz Oranlarına İlişkin Basın Duyurusu (2026-38)");
    expect(items[0]!.publishedAt?.toISOString()).toBe("2026-10-22T11:00:00.000Z");
    expect(items[1]!.summary).toBe("Türk lirası mevduat için zorunlu karşılık oranları yeniden belirlendi.");
    expect(items[0]!.id).toBe(externalIdFor("DUY2026-38"));
  });
  it("Atom: link href, published, id", () => {
    const items = parseFeed(tuikXml);
    expect(items).toHaveLength(3);
    expect(items[0]!.link).toBe("https://data.tuik.gov.tr/Bulten/Index?p=Tuketici-Fiyat-Endeksi-Eylul-2026-53912");
    expect(items[0]!.publishedAt?.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(items[0]!.id).toMatch(/^tuketici-fiyat-endeksi-eylul-2026-53912-[0-9a-f]{8}$/);
  });
  it("tarih biçimleri", () => {
    expect(parseFeedDate("05.10.2026 10:00")?.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(parseFeedDate("2026-10-05T10:00:00+03:00")?.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(parseFeedDate("hiç")).toBeUndefined();
  });
  it("externalIdFor okunabilir ve kararlı", () => {
    expect(externalIdFor("https://x.gov.tr/a/b/Basin/2026/DUY2026-38")).toMatch(/^duy2026-38-[0-9a-f]{8}$/);
    expect(externalIdFor("https://x.gov.tr/a/b/Basin/2026/DUY2026-38")).toBe(externalIdFor("https://x.gov.tr/a/b/Basin/2026/DUY2026-38"));
    expect(externalIdFor("https://x.gov.tr/")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("TcmbAdapter / TuikAdapter", () => {
  it("TCMB: İngilizce kopyayı eler, PPK bölümünü tanır", () => {
    const events = new TcmbAdapter({ feedUrl: "https://example.test/rss" }).eventsFromXml(tcmbXml);
    expect(events.map((e) => e.payload["section"])).toEqual(["ppk", "duzenleme"]);
    expect(events[0]!.sourceId).toBe("tcmb");
    expect(events[0]!.publishedAt.toISOString()).toBe("2026-10-22T11:00:00.000Z");
    expect(tcmbSection({ id: "x", title: "Enflasyon Raporu 2026-IV", link: "" }).section).toBe("rapor");
  });
  it("TÜİK: /en/ bültenlerini eler, konu bölümünü tanır", () => {
    const events = new TuikAdapter({ feedUrl: "https://example.test/atom" }).eventsFromXml(tuikXml);
    expect(events.map((e) => e.payload["section"])).toEqual(["fiyat", "buyume"]);
    expect(tuikSection({ id: "x", title: "İşgücü İstatistikleri, Ağustos 2026", link: "" }).section).toBe("isgucu");
  });
  it("fetchNew since filtresi + belge indirme", async () => {
    _resetHttpState();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (url.endsWith("/rss")) return new Response(tcmbXml, { status: 200, headers: { "content-type": "application/rss+xml" } });
      return new Response("<html><body><main>Para Politikası Kurulu karar metni</main></body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    };
    const a = new TcmbAdapter({ feedUrl: "https://example.test/rss", http: { fetchImpl } });
    const events = await a.fetchNew(new Date("2026-10-20T00:00:00Z"));
    expect(events).toHaveLength(1);
    const doc = await a.fetchDocument(events[0]!);
    expect(doc.mime).toBe("text/html");
    expect(doc.bytes.toString()).toContain("karar metni");
  });
  it("zamanlama: hot=true takvim sıklığı, aksi halde varsayılan", () => {
    const s = new TcmbAdapter({ feedUrl: "x" }).schedule();
    expect(intervalFor(s, new Date(), true)).toBe(30);
    expect(intervalFor(s, new Date(), false)).toBe(600);
    expect(intervalFor(new TuikAdapter({ feedUrl: "x" }).schedule())).toBe(900);
  });
  it("ortam değişkeni besleme adresini ezer", () => {
    process.env.TCMB_FEED_URL = "https://ornek.test/tcmb.xml";
    try { expect(new TcmbAdapter().feedUrl).toBe("https://ornek.test/tcmb.xml"); } finally { delete process.env.TCMB_FEED_URL; }
  });
});
