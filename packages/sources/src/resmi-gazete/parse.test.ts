import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDayPage, normalizeSection, parseIssueNo } from "./parse.js";
import { ResmiGazeteAdapter, dayPageUrl } from "./adapter.js";
import { intervalFor, nextDelaySeconds } from "../types.js";

const html = readFileSync(new URL("../../fixtures/day-2025-09-26.html", import.meta.url), "utf8");
const PAGE = "https://www.resmigazete.gov.tr/eskiler/2025/09/20250926.htm";

describe("parseDayPage", () => {
  const items = parseDayPage(html, PAGE);
  it("maddeleri bölümleriyle çıkarır", () => {
    expect(items.map((i) => [i.externalId, i.section])).toEqual([
      ["20250926-1", "yonetmelik"], ["20250926-2", "yonetmelik"], ["20250926-3", "yonetmelik"], ["20250926-4", "kurul-karari"],
    ]);
    expect(items[0]?.title).toBe("Organ Nakli Hizmetleri Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik");
    expect(items[0]?.url).toBe("https://www.resmigazete.gov.tr/eskiler/2025/09/20250926-1.htm");
    expect(items[3]?.ext).toBe("pdf");
    expect(items.every((i) => i.issueNo === 33029 && i.issueDate === "2025-09-26")).toBe(true);
  });
  it("ilan bölümü bağlantılarını (farklı ad kalıbı) almaz", () => {
    expect(items.some((i) => i.section === "ilan")).toBe(false);
  });
  it("mükerrer kimliklerini tanır", () => {
    const mk = parseDayPage(`<body><div class="html-title">KANUN</div><a href="20250926M1-1.htm">–– Bir Kanun</a></body>`, PAGE.replace(".htm", "M1.htm"));
    expect(mk[0]?.externalId).toBe("20250926M1-1");
    expect(mk[0]?.mukerrer).toBe(1);
    expect(mk[0]?.section).toBe("kanun");
  });
});

describe("normalizeSection / issueNo", () => {
  it.each([
    ["YÖNETMELİKLER", "yonetmelik"], ["TEBLİĞ", "teblig"], ["CUMHURBAŞKANI KARARLARI", "cb-karari"], ["KANUNLAR", "kanun"],
    ["ANAYASA MAHKEMESİ KARARI", "yargi"], ["YARGITAY KARARI", "yargi"], ["KURUL KARARI", "kurul-karari"], ["GENELGE", "genelge"],
    ["İLÂN BÖLÜMÜ", "ilan"], ["DÜZELTME", "duzeltme"], ["ATAMA KARARI", "diger"],
  ])("%s → %s", (label, sec) => expect(normalizeSection(label)).toBe(sec));
  it("sayı numarasını okur", () => expect(parseIssueNo("Resmî Gazete Sayı : 33029")).toBe(33029));
});

describe("ResmiGazeteAdapter", () => {
  const a = new ResmiGazeteAdapter();
  it("varsayılan bölüm filtresiyle RawEvent üretir", () => {
    const evs = a.eventsFromHtml(html, PAGE);
    expect(evs).toHaveLength(4);
    expect(evs[0]).toMatchObject({ sourceId: "resmi-gazete", externalId: "20250926-1" });
    expect(evs[0]?.payloadHash).toHaveLength(32);
    expect(evs[0]?.publishedAt.toISOString()).toBe("2025-09-26T03:00:00.000Z");
    expect(evs[0]?.payload).toMatchObject({ section: "yonetmelik", issueNo: 33029 });
  });
  it("aynı içerik için aynı hash üretir (dedupe anahtarı kararlı)", () => {
    const h1 = a.eventsFromHtml(html, PAGE)[0]!.payloadHash;
    const h2 = a.eventsFromHtml(html, PAGE)[0]!.payloadHash;
    expect(h1).toBe(h2);
  });
  it("gün ve mükerrer URL'lerini kurar", () => {
    expect(dayPageUrl("https://www.resmigazete.gov.tr", "2025-09-26")).toBe("https://www.resmigazete.gov.tr/eskiler/2025/09/20250926.htm");
    expect(dayPageUrl("https://www.resmigazete.gov.tr", "2025-09-26", 1)).toBe("https://www.resmigazete.gov.tr/eskiler/2025/09/20250926M1.htm");
  });
  it("gece 23:30–03:00 arası 2 dk, 06:00–10:00 arası 3 dk, dışında 30 dk", () => {
    const s = a.schedule();
    expect(intervalFor(s, new Date("2026-10-01T20:45:00Z"))).toBe(120);  // 23:45 TR
    expect(intervalFor(s, new Date("2026-10-01T21:00:00Z"))).toBe(120);  // 00:00 TR
    expect(intervalFor(s, new Date("2026-10-01T23:30:00Z"))).toBe(120);  // 02:30 TR
    expect(intervalFor(s, new Date("2026-10-02T01:00:00Z"))).toBe(1800); // 04:00 TR
    expect(intervalFor(s, new Date("2026-10-02T04:00:00Z"))).toBe(180);  // 07:00 TR
    expect(intervalFor(s, new Date("2026-10-02T11:00:00Z"))).toBe(1800); // 14:00 TR
  });
});

describe("nextDelaySeconds", () => {
  const s = new ResmiGazeteAdapter().schedule();
  it("bekleme sık tarama penceresinin başını aşmaz", () => {
    expect(nextDelaySeconds(s, new Date("2026-10-01T20:29:00Z"))).toBe(60);   // 23:29 TR → 23:30'a 60 sn
    expect(nextDelaySeconds(s, new Date("2026-10-01T20:45:00Z"))).toBe(120);  // pencere içinde: 2 dk
    expect(nextDelaySeconds(s, new Date("2026-10-02T02:45:00Z"))).toBe(900);  // 05:45 TR → 06:00'ya 15 dk
    expect(nextDelaySeconds(s, new Date("2026-10-02T11:00:00Z"))).toBe(1800); // 14:00 TR: varsayılan
  });
});
