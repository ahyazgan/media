import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { classifySourceError, looksLikeBlockPage, StructureError, describeSourceError } from "./health.js";
import { HttpError, _resetHttpState } from "./http.js";
import { decodeHtml } from "./extract.js";
import { ResmiGazeteAdapter } from "./resmi-gazete/adapter.js";
import { KapAdapter } from "./kap/adapter.js";
import { TcmbAdapter } from "./tcmb.js";
import { SpkAdapter } from "./listing/configs.js";

const fixture = (f: string) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8");
const rgDay = fixture("day-2025-09-26.html");

/** Tek adrese sabit yanıt veren sahte fetch (robots.txt serbest). */
function fakeFetch(body: string | Uint8Array, init: { status?: number; type?: string } = {}) {
  return (async (input: string | URL | Request) => {
    if (String(input).endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:", { status: 200 });
    return new Response(body, { status: init.status ?? 200, headers: { "content-type": init.type ?? "text/html; charset=utf-8" } });
  }) as typeof fetch;
}
const http = (f: typeof fetch) => ({ fetchImpl: f, maxRetries: 0 });

/** windows-1254 kodlayıcı (yalnızca testte kullanılan Türkçe harfler) */
const W1254: Record<string, number> = { Ç: 0xc7, ç: 0xe7, Ğ: 0xd0, ğ: 0xf0, İ: 0xdd, ı: 0xfd, Ö: 0xd6, ö: 0xf6, Ş: 0xde, ş: 0xfe, Ü: 0xdc, ü: 0xfc, Î: 0xce, î: 0xee, Â: 0xc2, â: 0xe2, "–": 0x96 };
const enc1254 = (s: string) => Uint8Array.from([...s].map((c) => W1254[c] ?? c.charCodeAt(0)));

beforeEach(() => _resetHttpState());

describe("hata sınıflandırma", () => {
  it.each([
    [new StructureError("kap", "x"), "structure"],
    [new HttpError(503, "https://x"), "http"],
    [new Error("robots.txt disallows /a on x"), "robots"],
    [Object.assign(new TypeError("fetch failed"), { cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" } }), "tls"],
    [Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }), "network"],
    [new Error("This operation was aborted"), "network"],
    [new Error("beklenmedik"), "unknown"],
  ] as const)("%s → %s", (e, kind) => expect(classifySourceError(e)).toBe(kind));
  it("engelleme sayfasını tanır", () => {
    expect(looksLikeBlockPage("<html><title>Just a moment...</title><div id=cf-chl-widget></div>")).toBe(true);
    expect(looksLikeBlockPage("<p>Erişiminiz engellenmiştir</p>")).toBe(true);
    expect(looksLikeBlockPage(rgDay)).toBe(false);
  });
  it("hata açıklamasına sayfa örneği ekler", () => {
    expect(describeSourceError(new StructureError("rg", "boş", "<html>  a   b</html>"))).toBe("rg: boş | örnek: <html> a b</html>");
  });
});

describe("Resmi Gazete yapı kontrolü", () => {
  it("normal fihrist → olaylar", async () => {
    const evs = await new ResmiGazeteAdapter({ http: http(fakeFetch(rgDay)) }).fetchDay("2025-09-26");
    expect(evs).toHaveLength(4);
  });
  it("engelleme sayfası → StructureError", async () => {
    const a = new ResmiGazeteAdapter({ http: http(fakeFetch("<html><body>Güvenlik doğrulaması: captcha</body></html>")) });
    await expect(a.fetchDay("2025-09-26")).rejects.toBeInstanceOf(StructureError);
  });
  it("yeniden tasarlanmış, madde bağlantısı olmayan sayfa → StructureError", async () => {
    const redesigned = `<html><body><h1>T.C. Resmî Gazete</h1><div data-doc="1">Organ Nakli Yönetmeliği</div></body></html>`;
    const a = new ResmiGazeteAdapter({ http: http(fakeFetch(redesigned)) });
    await expect(a.fetchDay("2025-09-26")).rejects.toThrow(/madde bağlantısı bulunamadı/);
  });
  it("404 (o gün henüz yayımlanmadı) → boş, hata değil", async () => {
    const a = new ResmiGazeteAdapter({ http: http(fakeFetch("yok", { status: 404 })) });
    expect(await a.fetchDay("2025-09-26")).toEqual([]);
  });
  it("mükerrer sayfa boşsa hata değil", async () => {
    const a = new ResmiGazeteAdapter({ http: http(fakeFetch("<html><body>Resmî Gazete</body></html>")) });
    expect(await a.fetchDay("2025-09-26", 1)).toEqual([]);
  });
  it("windows-1254 fihrist doğru çözülür", async () => {
    const legacy = rgDay.replace('<meta charset="utf-8">', '<meta http-equiv="Content-Type" content="text/html; charset=windows-1254">');
    const a = new ResmiGazeteAdapter({ http: http(fakeFetch(enc1254(legacy), { type: "text/html" })) });
    const evs = await a.fetchDay("2025-09-26");
    expect(evs[0]?.title).toBe("Organ Nakli Hizmetleri Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik");
    expect(evs[0]?.payload["section"]).toBe("yonetmelik");
    expect(decodeHtml(enc1254("<meta charset=windows-1254>İLÂN"))).toContain("İLÂN");
  });
});

describe("KAP, besleme ve liste yapı kontrolleri", () => {
  it("KAP: HTML dönerse ve alanlar değişirse StructureError; boş liste normal", async () => {
    const since = new Date(0);
    await expect(new KapAdapter({ http: http(fakeFetch("<html>bakım</html>")) }).fetchNew(since)).rejects.toThrow(/JSON değil/);
    await expect(new KapAdapter({ http: http(fakeFetch(JSON.stringify([{ foo: 1 }, { bar: 2 }]), { type: "application/json" })) }).fetchNew(since)).rejects.toThrow(/çözülemedi/);
    expect(await new KapAdapter({ http: http(fakeFetch("[]", { type: "application/json" })) }).fetchNew(since)).toEqual([]);
    const ok = await new KapAdapter({ http: http(fakeFetch(fixture("kap-disclosures.json"), { type: "application/json" })) }).fetchNew(since);
    expect(ok.length).toBeGreaterThan(0);
  });
  it("Besleme: RSS olmayan yanıt ve çözülemeyen öğeler StructureError", async () => {
    const since = new Date(0);
    await expect(new TcmbAdapter({ http: http(fakeFetch("<html><body>Sayfa taşındı</body></html>")) }).fetchNew(since)).rejects.toThrow(/RSS\/Atom değil/);
    await expect(new TcmbAdapter({ http: http(fakeFetch("<rss><channel><item><foo/></item></channel></rss>", { type: "application/rss+xml" })) }).fetchNew(since)).rejects.toThrow(/çözülemedi/);
    const ok = await new TcmbAdapter({ http: http(fakeFetch(fixture("tcmb-basin.xml"), { type: "application/rss+xml" })) }).fetchNew(since);
    expect(ok.length).toBeGreaterThan(0);
  });
  it("Liste: bağlantısız sayfa StructureError", async () => {
    await expect(new SpkAdapter({ http: http(fakeFetch("<html><body><p>Bakım çalışması</p></body></html>")) }).fetchNew(new Date(0))).rejects.toBeInstanceOf(StructureError);
  });
});
