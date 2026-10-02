import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BddkAdapter, BotasAdapter, EpdkAdapter, SpkAdapter, listingAdapterFor } from "./configs.js";
import { ListingAdapter } from "./adapter.js";
import { intervalFor } from "../types.js";
import { _resetHttpState } from "../http.js";
import { documentToText } from "../extract.js";
import { looksLikeBlockPage } from "../health.js";

const fx = (f: string) => readFileSync(new URL(`../../fixtures/${f}`, import.meta.url), "utf8");
// Sentetik örnek: genel liste kuralları için
const genericHtml = fx("bddk-duyurular.html");
// Canlıdan alınmış sayfalar (2026-10-02; script/stil ayıklanmış)
const spkHtml = fx("spk-bultenleri-2026.html");
const bddk39 = fx("bddk-liste-39.html");
const bddk48 = fx("bddk-liste-48.html");
const bddkDetail = fx("bddk-detay-4306.html");
const epdkHtml = fx("epdk-duyurular.html");
const epdkDetail = fx("epdk-detay-16457.html");
const botasList = fx("botas-satis-fiyat-tarifesi.html");
const botasDetail = fx("botas-tarife-812.html");

const NOW = () => new Date("2026-10-02T12:00:00Z");

describe("SpkAdapter (yıllık bülten sayfası)", () => {
  const spk = new SpkAdapter({ now: NOW });
  it("adres yılı yerine koyar", () => {
    expect(spk.listUrls()).toEqual(["https://spk.gov.tr/spk-bultenleri/2026-yili-spk-bultenleri"]);
  });
  it("yalnızca bülten PDF'leri; başlık 'SPK Bülteni 2026/67', tarih 'Yayımlanma' satırından", () => {
    const items = spk.parse(spkHtml);
    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(items[0]!.title).toBe("SPK Bülteni 2026/67");
    expect(items[0]!.date).toBe("2026-09-30");
    expect(items[0]!.url).toMatch(/^https:\/\/spk\.gov\.tr\/data\/[0-9a-f]+\/2026-67\.pdf$/);
    expect(items.some((i) => /Aydınlatma|STRATEJİK/i.test(i.title))).toBe(false);
  });
  it("zamanlama: hafta içi 18:00 TR → 600 sn; Cumartesi → 2 saat", () => {
    const s = spk.schedule();
    expect(intervalFor(s, new Date("2026-09-30T15:00:00Z"))).toBe(600);
    expect(intervalFor(s, new Date("2026-10-03T15:00:00Z"))).toBe(7_200);
  });
});

describe("BddkAdapter (kategori listeleri + PDF eki)", () => {
  it("basın listesi: tarih başlıktan atılır, bağlamdan okunur; yalnızca /Duyuru/Detay bağlantıları", () => {
    const items = new BddkAdapter({ now: NOW }).parse(bddk39);
    expect(items[0]!.title).toBe("Destek Yatırım Bankası A.Ş., Hedef Yatırım Bankası A.Ş., Tera Yatırım Bankası A.Ş. ile Destek Finans Faktoring A.Ş. ve Tera Finans Faktoring A.Ş. Hakkında Basın Duyurusu");
    expect(items[0]!.date).toBe("2026-09-30");
    expect(items[0]!.url).toBe("https://www.bddk.org.tr/Duyuru/Detay/4306");
    expect(items.every((i) => /\/Duyuru\/Detay\/\d+$/.test(i.url))).toBe(true);
  });
  it("aynı duyuru iki kategoride (4306 basın, 4307 kuruluş) tek olaya iner; belge PDF ekidir", async () => {
    _resetHttpState();
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      urls.push(url);
      if (url.endsWith("/Liste/39")) return new Response(bddk39, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.endsWith("/Liste/48")) return new Response(bddk48, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.endsWith("/Liste/40")) return new Response(bddk39.replace(/Detay\/(\d+)/g, "Detay/9$1").replace(/30\.09\.2026/g, "01.01.2020"), { status: 200 });
      if (url.endsWith("/Detay/4306")) return new Response(bddkDetail, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.includes("/EkGetir/4306")) return new Response(Buffer.from("%PDF-1.4 ek"), { status: 200, headers: { "content-type": "application/pdf" } });
      return new Response("yok", { status: 404 });
    };
    const a = new BddkAdapter({ http: { fetchImpl }, now: NOW });
    const events = await a.fetchNew(new Date("2026-09-29T00:00:00Z"));
    expect(events.map((e) => e.externalId.split("-")[0])).toEqual(["4306"]);
    const doc = await a.fetchDocument(events[0]!);
    expect(doc.url).toBe("https://www.bddk.org.tr/Duyuru/EkGetir/4306?ekId=939");
    expect(doc.mime).toBe("application/pdf");
    expect(urls.filter((u) => /\/Liste\//.test(u))).toHaveLength(3);
  });
});

describe("EpdkAdapter (duyuru tablosu)", () => {
  it("tablodaki duyurular, Tarih sütunu; menü bağlantıları alınmaz", () => {
    const items = new EpdkAdapter({ now: NOW }).parse(epdkHtml);
    expect(items[0]).toMatchObject({ title: "Güneyyaka HES üretim tesisi santral sahası ilanı hakkında", date: "2026-09-30" });
    expect(items.every((i) => /\/Detay\/Icerik\/4-\d+\//.test(i.url))).toBe(true);
  });
  it("belge yalnızca ana içerik (menü metni yok); reCAPTCHA script'i engelleme sayılmaz", async () => {
    expect(looksLikeBlockPage(epdkHtml)).toBe(false);
    _resetHttpState();
    const fetchImpl: typeof fetch = async (input) => String(input).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response(epdkDetail, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    const a = new EpdkAdapter({ http: { fetchImpl } });
    const [ev] = a.eventsFromHtml(epdkHtml);
    const text = await documentToText("text/html", (await a.fetchDocument(ev!)).bytes);
    expect(text).toContain("Enerji Piyasası Düzenleme Kurumundan");
    expect(text).not.toContain("Önceki Başkan Yardımcıları");
  });
});

describe("BotasAdapter (satış fiyat tarifesi)", () => {
  it("yürürlükteki tarife kartı tek olay; tarih başlıktaki yürürlük günü", () => {
    const events = new BotasAdapter().eventsFromHtml(botasList);
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe("4 Nisan 2026 Tarihinden İtibaren Geçerli BOTAŞ Doğal Gaz Toptan Satış Fiyat Tarifesi");
    expect(events[0]!.publishedAt.toISOString()).toBe("2026-04-03T21:00:00.000Z");
    expect(events[0]!.payload["section"]).toBe("tarife");
  });
  it("cdnjs.cloudflare.com script'i engelleme sayılmaz; belge fiyat tablosudur", async () => {
    expect(looksLikeBlockPage(botasList)).toBe(false);
    expect(looksLikeBlockPage("<html><title>Just a moment...</title><div id=cf-chl-widget></div>")).toBe(true);
    _resetHttpState();
    const fetchImpl: typeof fetch = async (input) => String(input).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response(botasDetail, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    const a = new BotasAdapter({ http: { fetchImpl } });
    const [ev] = a.eventsFromHtml(botasList);
    const text = await documentToText("text/html", (await a.fetchDocument(ev!)).bytes);
    expect(text).toContain("10,625000");
    expect(text).not.toContain("Kurumsal Kimlik Kılavuzu");
  });
});

describe("genel liste kuralları", () => {
  const generic = new BddkAdapter({ listUrl: "https://www.bddk.org.tr/Duyuru", containerSelector: "body", linkPattern: /duyuru|\.pdf(\?|$)/i, extraListUrls: [], now: () => new Date("2026-09-27T09:00:00Z") });
  it("Türkçe metin tarihi, kurul kararı bölümü, tarihsiz öğe çekim anıyla", () => {
    const events = generic.eventsFromHtml(genericHtml);
    expect(events).toHaveLength(4);
    expect(events[0]!.publishedAt.toISOString()).toBe("2026-09-26T07:00:00.000Z");
    expect(events[1]!.payload["section"]).toBe("kurul-karari");
    expect(events[3]!.payload["undated"]).toBe(true);
    expect(events[3]!.publishedAt.toISOString()).toBe("2026-09-27T09:00:00.000Z");
    expect(events.some((e) => /Iletisim/.test(e.url))).toBe(false);
  });
  it("allowUndated=false tarihsizleri atar; kapsayıcı seçici çalışır", () => {
    const a = new ListingAdapter({ id: "x", listUrl: "https://x.test/l", schedule: { timezone: "Europe/Istanbul", windows: [], defaultEverySeconds: 60 }, containerSelector: "#content", linkPattern: /Duyuru/, allowUndated: false, section: { section: "d", sectionLabel: "D" } });
    expect(a.parse(genericHtml).map((i) => i.title)).toHaveLength(3);
  });
  it("fabrika, ortam değişkeni ve boş seçenek", () => {
    expect(listingAdapterFor("spk")).toBeInstanceOf(SpkAdapter);
    expect(listingAdapterFor("epdk")).toBeInstanceOf(EpdkAdapter);
    expect(listingAdapterFor("botas")).toBeInstanceOf(BotasAdapter);
    expect(listingAdapterFor("yok")).toBeUndefined();
    process.env.EPDK_LIST_URL = "https://ornek.test/epdk";
    try { expect(new EpdkAdapter().listUrl).toBe("https://ornek.test/epdk"); } finally { delete process.env.EPDK_LIST_URL; }
    expect(new BddkAdapter({ listUrl: undefined }).listUrl).toBe("https://www.bddk.org.tr/Duyuru/Liste/39");
  });
});
