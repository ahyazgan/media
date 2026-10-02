import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findAllDates, findDate, parseTcmbCalendar, parseTuikCalendar, parseTuikCalendarJson } from "./parse.js";
import { importCalendars } from "./import.js";
import { _resetHttpState } from "../http.js";

const tuikHtml = readFileSync(new URL("../../fixtures/tuik-takvim.html", import.meta.url), "utf8");
const tcmbHtml = readFileSync(new URL("../../fixtures/tcmb-ppk-takvim.html", import.meta.url), "utf8");

describe("tarih bulma", () => {
  it("Türkçe metin, noktalı ve ISO", () => {
    expect(findDate("Bülten 5 Ekim 2026 saat 10:00")).toBe("2026-10-05");
    expect(findDate("05.10.2026")).toBe("2026-10-05");
    expect(findDate("2026-10-05")).toBe("2026-10-05");
    expect(findDate("tarih yok")).toBeUndefined();
    expect(findAllDates("22 Ocak 2026 ve 29 Ocak 2026, 12.03.2026")).toEqual(["2026-01-22", "2026-01-29", "2026-03-12"]);
  });
});

describe("parseTuikCalendar", () => {
  const entries = parseTuikCalendar(tuikHtml, { sourceUrl: "https://data.tuik.gov.tr/Bulten/UlusalVeriYayimlamaTakvimi" });
  it("satırları bülten girdilerine çevirir (başlık satırı atlanır)", () => {
    expect(entries).toHaveLength(5);
    expect(entries[0]).toMatchObject({ institution: "tuik", title: "Tüketici Fiyat Endeksi", sourceUrl: "https://data.tuik.gov.tr/Bulten/Index?p=Tuketici-Fiyat-Endeksi-Eylul-2026-53912" });
    expect(entries[0]!.scheduledAt.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(entries[4]!.title).toBe("Dış Ticaret İstatistikleri");
    expect(entries[4]!.scheduledAt.toISOString()).toBe("2026-10-30T07:00:00.000Z");
  });
  it("liste biçimini de kabul eder; saat yoksa 10:00", () => {
    const e = parseTuikCalendar(`<ul><li>12.11.2026 — Sanayi Üretim Endeksi, Eylül 2026</li></ul>`);
    expect(e).toHaveLength(1);
    expect(e[0]!.scheduledAt.toISOString()).toBe("2026-11-12T07:00:00.000Z");
  });
});

describe("parseTcmbCalendar", () => {
  const entries = parseTcmbCalendar(tcmbHtml, { year: 2026, sourceUrl: "https://tcmb.example/ppk" });
  it("toplantı ve özet tarihlerini ayırır, nav/footer tarihlerini almaz", () => {
    const meetings = entries.filter((e) => e.title === "PPK Toplantısı ve Faiz Kararı");
    const summaries = entries.filter((e) => e.title === "PPK Toplantı Özeti");
    expect(meetings).toHaveLength(8);
    expect(summaries).toHaveLength(8);
    expect(meetings[0]!.scheduledAt.toISOString()).toBe("2026-01-22T11:00:00.000Z");
    expect(entries.some((e) => e.scheduledAt.toISOString().startsWith("2025-12-15"))).toBe(false);
    expect(entries.find((e) => e.title === "Enflasyon Raporu")?.scheduledAt.toISOString()).toBe("2026-11-06T07:30:00.000Z");
  });
});

describe("importCalendars", () => {
  it("bir kurum hata verse de diğeri döner", async () => {
    _resetHttpState();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (url.includes("tuik")) return new Response(tuikHtml, { status: 200 });
      return new Response("yok", { status: 404 });
    };
    const r = await importCalendars({ tuikUrl: "https://tuik.test/takvim", tcmbUrl: "https://tcmb.test/ppk", http: { fetchImpl, maxRetries: 0 } });
    expect(r.entries).toHaveLength(5);
    expect(r.errors).toEqual([{ institution: "tcmb", error: expect.stringContaining("404") }]);
  });
});

// Canlıdan alınmış örnekler (2026-10-02)
const tuikJson = JSON.parse(readFileSync(new URL("../../fixtures/tuik-takvim-2026.json", import.meta.url), "utf8"));
const tcmbLive = readFileSync(new URL("../../fixtures/tcmb-takvim.html", import.meta.url), "utf8");

describe("canlı takvim biçimleri", () => {
  it("TÜİK JSON: yalnızca TÜİK satırları, başlık + dönem, Türkiye saati", () => {
    const e = parseTuikCalendarJson(tuikJson, { sourceUrl: "https://www.tuik.gov.tr/Kurumsal/Veri_Takvimi" });
    expect(e.map((x) => x.title)).toEqual(["Yapay Zeka İstatistikleri, 2026", "Tüketici Fiyat Endeksi (TÜFE), Eylül 2026", "Yurt İçi Üretici Fiyat Endeksi, Eylül 2026"]);
    expect(e[1]!.scheduledAt.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(e.every((x) => x.institution === "tuik")).toBe(true);
  });
  it("TCMB Takvim sayfası: dört sütun (karar, özet, enflasyon raporu, finansal istikrar raporu)", () => {
    const e = parseTcmbCalendar(tcmbLive, { year: 2026 });
    expect(e).toHaveLength(22);
    expect(e.filter((x) => x.title === "PPK Toplantısı ve Faiz Kararı").map((x) => x.scheduledAt.toISOString().slice(0, 10)))
      .toEqual(["2026-01-22", "2026-03-12", "2026-04-22", "2026-06-11", "2026-07-23", "2026-09-10", "2026-10-22", "2026-12-10"]);
    expect(e.find((x) => x.title === "Finansal İstikrar Raporu" && x.scheduledAt.getUTCMonth() === 10)?.scheduledAt.toISOString()).toBe("2026-11-27T07:30:00.000Z");
  });
  it("importCalendars TÜİK JSON ucunu {yil} ile çağırır", async () => {
    _resetHttpState();
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      seen.push(url);
      if (url.includes("tuik")) return Response.json(tuikJson);
      return new Response(tcmbLive, { status: 200 });
    };
    const r = await importCalendars({ tuikUrl: "https://tuik.test/GetYillikHaberBulteniListesi?yil={yil}", tcmbUrl: "https://tcmb.test/takvim", year: 2026, http: { fetchImpl, maxRetries: 0 } });
    expect(seen[0]).toBe("https://tuik.test/GetYillikHaberBulteniListesi?yil=2026");
    expect(r.errors).toEqual([]);
    expect(r.entries.filter((x) => x.institution === "tuik")).toHaveLength(3);
    expect(r.entries.filter((x) => x.institution === "tcmb")).toHaveLength(22);
  });
});
