import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findAllDates, findDate, parseTcmbCalendar, parseTuikCalendar } from "./parse.js";
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
