import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TuikAdapter, tuikSection } from "./tuik.js";
import { _resetHttpState } from "./http.js";
import { documentToText } from "./extract.js";
import { StructureError } from "./health.js";

// Canlıdan alınmış, kısaltılmış yanıtlar (2026-10-02)
const latest = JSON.parse(readFileSync(new URL("../fixtures/tuik-press-latest.json", import.meta.url), "utf8"));
const detail = readFileSync(new URL("../fixtures/tuik-press-58239.json", import.meta.url), "utf8");

describe("TuikAdapter (veriportali JSON API)", () => {
  it("yalnızca haber bültenlerini (typeId 1) olaya çevirir", () => {
    const events = new TuikAdapter({ baseUrl: "https://veriportali.tuik.gov.tr" }).eventsFromJson(latest);
    expect(events.map((e) => e.payload["pressId"])).toEqual(["62066", "58117", "58239", "58098", "57987"]);
    const dt = events[2]!;
    expect(dt.title).toBe("Dış Ticaret İstatistikleri, Ağustos 2026");
    expect(dt.externalId).toBe("dis-ticaret-istatistikleri-agustos-2026-58239");
    expect(dt.url).toBe("https://veriportali.tuik.gov.tr/tr/press/58239");
    expect(dt.publishedAt.toISOString()).toBe("2026-09-30T07:00:00.000Z");
    expect(dt.payload["section"]).toBe("dis-ticaret");
  });

  it("bölüm etiketleri", () => {
    expect(tuikSection("İşgücü İstatistikleri").section).toBe("isgucu");
    expect(tuikSection("Hizmet Üretici Fiyat Endeksi").section).toBe("fiyat");
    expect(tuikSection("Yapay Zeka İstatistikleri").section).toBe("bulten");
  });

  it("fetchNew X-Requested-With gönderir, since filtresi uygular; belge bülten HTML'idir", async () => {
    _resetHttpState();
    const seen: Record<string, string>[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      seen.push((init?.headers ?? {}) as Record<string, string>);
      if (url.endsWith("/api/tr/press/latest")) return Response.json(latest);
      if (url.endsWith("/api/tr/press/58239")) return new Response(detail, { status: 200, headers: { "content-type": "application/json" } });
      return new Response("Sayfa bulunamadı", { status: 404 });
    };
    const a = new TuikAdapter({ baseUrl: "https://tuik.test", http: { fetchImpl } });
    const events = await a.fetchNew(new Date("2026-09-30T00:00:00Z"));
    expect(events.map((e) => e.payload["pressId"])).toEqual(["62066", "58117", "58239", "58098", "57987"]);
    expect(seen[0]!["x-requested-with"]).toBe("XMLHttpRequest");
    const doc = await a.fetchDocument(events[2]!);
    expect(doc.url).toBe("https://tuik.test/tr/press/58239");
    const text = await documentToText(doc.mime, doc.bytes);
    expect(text).toContain("ihracat %8,1, ithalat %10,5 arttı");
  });

  it("JSON yerine HTML gelirse yapı hatası", async () => {
    _resetHttpState();
    const fetchImpl: typeof fetch = async (input) =>
      String(input).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("<!doctype html><html></html>", { status: 200 });
    await expect(new TuikAdapter({ baseUrl: "https://tuik.test", http: { fetchImpl } }).fetchNew(new Date(0))).rejects.toBeInstanceOf(StructureError);
  });

  it("taban adres ortam değişkeninden ezilir, boş seçenek varsayılanı ezmez", () => {
    expect(new TuikAdapter({ baseUrl: undefined }).baseUrl).toBe("https://veriportali.tuik.gov.tr");
    process.env.TUIK_BASE_URL = "https://ornek.test/";
    try { expect(new TuikAdapter().baseUrl).toBe("https://ornek.test"); } finally { delete process.env.TUIK_BASE_URL; }
  });
});
