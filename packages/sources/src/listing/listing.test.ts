import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BddkAdapter, BotasAdapter, EpdkAdapter, SpkAdapter, listingAdapterFor } from "./configs.js";
import { ListingAdapter } from "./adapter.js";
import { intervalFor } from "../types.js";
import { _resetHttpState } from "../http.js";

const spkHtml = readFileSync(new URL("../../fixtures/spk-bultenler.html", import.meta.url), "utf8");
const bddkHtml = readFileSync(new URL("../../fixtures/bddk-duyurular.html", import.meta.url), "utf8");

describe("SpkAdapter", () => {
  const spk = new SpkAdapter({ listUrl: "https://spk.gov.tr/haftalik-bultenler" });
  it("yalnızca Türkçe haftalık bülten PDF'lerini alır, tarihi satırdan okur", () => {
    const items = spk.parse(spkHtml);
    expect(items.map((i) => i.title)).toEqual(["2026/39 Sayılı Haftalık Bülten", "2026/38 Sayılı Haftalık Bülten", "2026/37 Sayılı Haftalık Bülten", "Aylık İstatistik Bülteni Ağustos 2026"]);
    expect(items[0]!.url).toBe("https://spk.gov.tr/data/bulten/2026-39.pdf");
    expect(items[0]!.date).toBe("2026-09-25");
    expect(items[0]!.publishedAt.toISOString()).toBe("2026-09-25T14:30:00.000Z");
  });
  it("RawEvent: pdf ext, bölüm etiketi, kararlı externalId", () => {
    const [e] = spk.eventsFromHtml(spkHtml);
    expect(e!.sourceId).toBe("spk");
    expect(e!.payload).toMatchObject({ section: "haftalik-bulten", sectionLabel: "SPK Haftalık Bülten (2026-09-25)", ext: "pdf", undated: false });
    expect(e!.externalId).toMatch(/^2026-39-pdf-[0-9a-f]{8}$/);
    expect(e!.payloadHash).toHaveLength(32);
  });
  it("zamanlama: Cuma 18:00 TR → 300 sn; Cumartesi → 6 saat", () => {
    const s = spk.schedule();
    expect(intervalFor(s, new Date("2026-09-25T15:00:00Z"))).toBe(300);
    expect(intervalFor(s, new Date("2026-09-26T15:00:00Z"))).toBe(21_600);
  });
  it("fetchNew since'ten yenileri döndürür; fetchDocument PDF'i mime'dan tanır", async () => {
    _resetHttpState();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (url.endsWith("/haftalik-bultenler")) return new Response(spkHtml, { status: 200 });
      return new Response(Buffer.from("%PDF-1.7 test"), { status: 200, headers: { "content-type": "application/octet-stream" } });
    };
    const a = new SpkAdapter({ listUrl: "https://spk.gov.tr/haftalik-bultenler", http: { fetchImpl } });
    const events = await a.fetchNew(new Date("2026-09-20T00:00:00Z"));
    // 25.09 since'ten yeni; 18.09 ve 11.09 eski; tarihsiz aylık bülten dedupe'a bırakılır (dahil)
    expect(events.map((e) => e.title)).toEqual(["2026/39 Sayılı Haftalık Bülten", "Aylık İstatistik Bülteni Ağustos 2026"]);
    const doc = await a.fetchDocument(events[0]!);
    expect(doc.mime).toBe("application/pdf");
  });
});

describe("BddkAdapter ve genel liste kuralları", () => {
  const bddk = new BddkAdapter({ listUrl: "https://www.bddk.org.tr/Duyuru", now: () => new Date("2026-09-27T09:00:00Z") });
  it("duyuru bağlantıları, Türkçe metin tarihi, kurul kararı bölümü, tarihsiz öğe çekim anıyla", () => {
    const events = bddk.eventsFromHtml(bddkHtml);
    expect(events).toHaveLength(4);
    expect(events[0]!.publishedAt.toISOString()).toBe("2026-09-26T07:00:00.000Z");
    expect(events[1]!.payload["section"]).toBe("kurul-karari");
    expect(events[3]!.payload["undated"]).toBe(true);
    expect(events[3]!.publishedAt.toISOString()).toBe("2026-09-27T09:00:00.000Z");
    expect(events.some((e) => /Iletisim/.test(e.url))).toBe(false);
  });
  it("allowUndated=false tarihsizleri atar; kapsayıcı seçici çalışır", () => {
    const a = new ListingAdapter({ id: "x", listUrl: "https://x.test/l", schedule: { timezone: "Europe/Istanbul", windows: [], defaultEverySeconds: 60 }, containerSelector: "#content", linkPattern: /Duyuru/, allowUndated: false, section: { section: "d", sectionLabel: "D" } });
    expect(a.parse(bddkHtml).map((i) => i.title)).toHaveLength(3);
  });
  it("fabrika ve diğer yapılandırmalar", () => {
    expect(listingAdapterFor("spk")).toBeInstanceOf(SpkAdapter);
    expect(listingAdapterFor("epdk")).toBeInstanceOf(EpdkAdapter);
    expect(listingAdapterFor("botas")).toBeInstanceOf(BotasAdapter);
    expect(listingAdapterFor("yok")).toBeUndefined();
    process.env.EPDK_LIST_URL = "https://ornek.test/epdk";
    try { expect(new EpdkAdapter().listUrl).toBe("https://ornek.test/epdk"); } finally { delete process.env.EPDK_LIST_URL; }
    expect(new BotasAdapter().toEvent({ title: "Doğal Gaz Toptan Satış Fiyat Tarifesi Ekim 2026", url: "https://www.botas.gov.tr/Icerik/tarife-ekim-2026/1", publishedAt: new Date(), context: "" }).payload["section"]).toBe("tarife");
  });
});
