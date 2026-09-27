import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SERIES, evdsUrl, fetchEvds, parseEvds } from "./evds.js";
import { _resetHttpState } from "./http.js";

const json = JSON.parse(readFileSync(new URL("../fixtures/evds-kurlar.json", import.meta.url), "utf8"));
const codes = DEFAULT_SERIES.map((s) => s.code);

describe("EVDS", () => {
  it("URL biçimi dd-MM-yyyy ve seri birleştirme", () => {
    expect(evdsUrl(["TP.DK.USD.A", "TP.DK.EUR.A"], new Date("2026-09-16T12:00:00Z"), new Date("2026-09-26T12:00:00Z")))
      .toBe("https://evds2.tcmb.gov.tr/service/evds/series=TP.DK.USD.A-TP.DK.EUR.A&startDate=16-09-2026&endDate=26-09-2026&type=json");
  });
  it("items → noktalar; null günler atlanır; alt çizgili alan adları eşlenir", () => {
    const pts = parseEvds(json, codes);
    expect(pts).toHaveLength(12);
    expect(pts.find((p) => p.series === "TP.DK.USD.A" && p.date === "2026-09-25")?.value).toBe(41.3125);
    expect(pts.some((p) => p.date === "2026-09-26")).toBe(false);
    expect(parseEvds({ items: [{ Tarih: "01.02.2026", "TP.DK.USD.A": "40,5" }] }, ["TP.DK.USD.A"])).toEqual([{ series: "TP.DK.USD.A", date: "2026-02-01", value: 40.5 }]);
    expect(parseEvds("saçma", codes)).toEqual([]);
  });
  it("fetchEvds anahtarı başlıkta gönderir", async () => {
    _resetHttpState();
    let hdr = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      hdr = (init?.headers as Record<string, string>)["key"] ?? "";
      return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    };
    const pts = await fetchEvds("gizli", codes, { http: { fetchImpl }, now: new Date("2026-09-26T12:00:00Z") });
    expect(hdr).toBe("gizli");
    expect(pts).toHaveLength(12);
  });
});
