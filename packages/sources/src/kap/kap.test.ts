import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KapAdapter } from "./adapter.js";
import { parseDisclosureList, parseKapDate, shortCompanyName, splitStockCodes } from "./parse.js";
import { intervalFor } from "../types.js";
import { _resetHttpState } from "../http.js";
import { documentToText } from "../extract.js";

// Sentetik örnek (eski { basic } biçimi; ajan altın örnekleri bu numaralara bağlı)
const json = JSON.parse(readFileSync(new URL("../../fixtures/kap-disclosures.json", import.meta.url), "utf8"));
// Canlıdan alınmış kısaltılmış liste (POST /tr/api/disclosure/list/main, 2026-10-02) ve bir bildirim PDF'i
const live = JSON.parse(readFileSync(new URL("../../fixtures/kap-list-main.json", import.meta.url), "utf8"));
const livePdf = readFileSync(new URL("../../fixtures/kap-bildirim-1671363.pdf", import.meta.url));

describe("KAP canlı biçim (disclosureBasic)", () => {
  it("companyTitle/stockCode alanlarını okur, kodsuz kayıtları eler", () => {
    const events = new KapAdapter().eventsFromJson(live);
    expect(events.map((e) => e.externalId)).toEqual(["1671363", "1671362", "1671361", "1671358", "1671357", "1671356", "1671330"]);
    const e = events[0]!;
    expect(e.title).toBe("DYO BOYA FABRİKALARI SANAYİ VE TİCARET A.Ş. — Özel Durum Açıklaması (Genel)");
    expect(e.payload["stockCodes"]).toEqual(["DYOBY"]);
    expect(e.payload["summary"]).toBe("Görevden Ayrılma ve Atama Hk.");
    expect(e.publishedAt.toISOString()).toBe("2026-10-02T12:43:24.000Z");
    expect(events[1]!.payload["stockCodes"]).toEqual(["NRBNK", "NYB"]);
  });
  it("bildirim PDF'inden metin çıkar", async () => {
    const text = await documentToText("application/pdf", livePdf);
    expect(text).toContain("Mali İşler ve Finans");
  });
  it("liste gövdesi: since gününden bugüne, en fazla 7 gün", () => {
    const a = new KapAdapter();
    const now = new Date("2026-10-02T12:00:00Z");
    expect(JSON.parse(a.listBody(new Date("2026-10-01T22:30:00Z"), now))).toEqual({ fromDate: "02.10.2026", toDate: "02.10.2026", memberTypes: ["IGS", "DDK"] });
    expect(JSON.parse(a.listBody(new Date(0), now)).fromDate).toBe("25.09.2026");
  });
});

describe("KAP parse", () => {
  it("Türkiye saatini UTC'ye çevirir", () => {
    expect(parseKapDate("25.09.2026 18:42:11")?.toISOString()).toBe("2026-09-25T15:42:11.000Z");
    expect(parseKapDate("25.09.2026")?.toISOString()).toBe("2026-09-24T21:00:00.000Z");
    expect(parseKapDate("saçma")).toBeUndefined();
  });
  it("borsa kodlarını ayırır ve normalize eder", () => {
    expect(splitStockCodes("DEMHO, DEMLJ")).toEqual(["DEMHO", "DEMLJ"]);
    expect(splitStockCodes("ornek")).toEqual(["ORNEK"]);
    expect(splitStockCodes("")).toEqual([]);
    expect(splitStockCodes(["ISCTR", "ISCTR"])).toEqual(["ISCTR"]);
  });
  it("kısa şirket adı üretir", () => {
    expect(shortCompanyName("ÖRNEK ENERJİ A.Ş.")).toBe("Örnek Enerji");
    expect(shortCompanyName("TÜPRAŞ-TÜRKİYE PETROL RAFİNERİLERİ A.Ş.")).toBe("Tüpraş");
    expect(shortCompanyName("DEMO HOLDİNG A.Ş.")).toBe("Demo");
  });
  it("liste JSON'unu ayrıştırır, yeniden eskiye sıralar", () => {
    const list = parseDisclosureList(json);
    expect(list).toHaveLength(8);
    expect(list[0]?.index).toBe(1400006);
    expect(list.at(-1)?.index).toBe(1399990);
    const fr = list.find((d) => d.index === 1400005)!;
    expect(fr.disclosureClass).toBe("FR");
    expect(fr.classLabel).toBe("Finansal Rapor");
    expect(fr.url).toBe("https://www.kap.org.tr/tr/Bildirim/1400005");
  });
  it("basic sarmalayıcısı olmayan düz kayıtları ve {data:[...]} zarfını kabul eder", () => {
    const flat = { data: [{ disclosureIndex: "77", publishDate: "01.02.2026 09:00:00", companyName: "X A.Ş.", stockCode: "XAS", disclosureClass: "Özel Durum Açıklaması", subject: "Konu" }] };
    const [d] = parseDisclosureList(flat);
    expect(d?.index).toBe(77);
    expect(d?.stockCodes).toEqual(["XAS"]);
    expect(d?.disclosureClass).toBe("ODA");
    expect(d?.companyName).toBe("X A.Ş.");
  });
});

describe("KapAdapter", () => {
  const adapter = new KapAdapter();
  it("fon (kodsuz) ve eski KAP kayıtlarını eler, RawEvent üretir", () => {
    const events = adapter.eventsFromJson(json);
    expect(events.map((e) => e.externalId)).toEqual(["1400006", "1400005", "1400004", "1400003", "1400002", "1400001"]);
    const e = events.find((x) => x.externalId === "1400002")!;
    expect(e.sourceId).toBe("kap");
    expect(e.title).toBe("DEMO HOLDİNG A.Ş. — Yeni İş İlişkisi");
    expect(e.payload["companies"]).toEqual([{ code: "DEMHO", name: "DEMO HOLDİNG A.Ş." }, { code: "DEMLJ", name: "DEMO HOLDİNG A.Ş." }]);
    expect(e.payload["section"]).toBe("ODA");
    expect(e.payloadHash).toHaveLength(32);
  });
  it("aynı bildirim aynı hash'i, farklı özet farklı hash'i üretir", () => {
    const a = adapter.eventsFromJson(json).find((x) => x.externalId === "1400001")!;
    const b = adapter.eventsFromJson(json).find((x) => x.externalId === "1400001")!;
    expect(a.payloadHash).toBe(b.payloadHash);
    const mutated = structuredClone(json) as { basic: Record<string, unknown> }[];
    mutated.find((x) => x.basic["disclosureIndex"] === 1400001)!.basic["summary"] = "düzeltilmiş özet";
    expect(adapter.eventsFromJson(mutated).find((x) => x.externalId === "1400001")!.payloadHash).not.toBe(a.payloadHash);
  });
  it("sınıf filtresi çalışır", () => {
    const only = new KapAdapter({ classes: ["FR"] });
    expect(only.eventsFromJson(json).map((e) => e.externalId)).toEqual(["1400005"]);
  });
  it("fetchNew since'ten yenileri döndürür; JSON gövdeli POST gönderir", async () => {
    _resetHttpState();
    let accept = "";
    let method = "";
    let body = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      accept = (init?.headers as Record<string, string>)["accept"] ?? "";
      method = init?.method ?? "";
      body = String(init?.body ?? "");
      expect(url).toBe("https://www.kap.org.tr/tr/api/disclosure/list/main");
      return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    };
    const a = new KapAdapter({ http: { fetchImpl, respectRobots: true } });
    const events = await a.fetchNew(new Date("2026-09-25T14:00:00Z"));
    expect(accept).toBe("application/json");
    expect(method).toBe("POST");
    expect(JSON.parse(body).memberTypes).toEqual(["IGS", "DDK"]);
    expect(events.map((e) => e.externalId)).toEqual(["1400006", "1400005", "1400004", "1400003"]);
  });
  it("fetchDocument önce PDF'i dener; PDF 404 verirse bildirim sayfasına düşer", async () => {
    _resetHttpState();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (/BildirimPdf/.test(url)) return new Response("yok", { status: 404 });
      return new Response("<html><body>bildirim</body></html>", { status: 200, headers: { "content-type": "text/html" } });
    };
    const a = new KapAdapter({ http: { fetchImpl } });
    const [ev] = a.eventsFromJson(json);
    const doc = await a.fetchDocument(ev!);
    expect(doc.mime).toBe("text/html");
    expect(doc.url).toBe("https://www.kap.org.tr/tr/Bildirim/1400006");
  });
  it("zamanlama: hafta içi seans saatinde 60 sn, hafta sonu ve gece 300 sn", () => {
    const s = adapter.schedule();
    expect(intervalFor(s, new Date("2026-09-25T08:00:00Z"))).toBe(60);   // Cuma 11:00 TR
    expect(intervalFor(s, new Date("2026-09-26T08:00:00Z"))).toBe(300);  // Cumartesi 11:00 TR
    expect(intervalFor(s, new Date("2026-09-25T20:00:00Z"))).toBe(300);  // Cuma 23:00 TR
  });
});
