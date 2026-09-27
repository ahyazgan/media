import { describe, expect, it } from "vitest";
import { runEditRules } from "../src/edit/rules.js";
import type { WriteOutput } from "../src/schemas.js";

const DOC = `Ticaret Bakanlığından: MADDE 1- 30/5/2018 tarihli ve 30436 sayılı Resmî Gazete'de yayımlanan Yönetmeliğin 7 nci maddesinin ikinci fıkrasına aşağıdaki cümleler eklenmiştir. "Komisyon, ticaret il müdürü başkanlığında üç üyeden oluşur." MADDE 3- Bu Yönetmelik 1/10/2025 tarihinde yürürlüğe girer.`;

const body = Array.from({ length: 30 }, () => "Ticaret Bakanlığı uzlaşma komisyonlarının il müdürlüklerinde kurulmasına imkân tanıdı.").join(" ");

const good: WriteOutput = {
  title: "Ticaret Bakanlığı uzlaşma komisyonlarını illere yayıyor",
  dek: "Değişiklik 1 Ekim 2025'te yürürlüğe giriyor.",
  bodyMarkdown: body + " Komisyon üç üyeden oluşacak.",
  keyFacts: [{ text: "Komisyon üç üyeden oluşur", quoteFromSource: "Komisyon, ticaret il müdürü başkanlığında üç üyeden oluşur." }],
  tickers: [], tags: ["mevzuat"], numbersUsed: ["1/10/2025", "7", "30436"],
};

describe("runEditRules", () => {
  it("temiz ve düşük önemli makaleyi yayınlar", () => {
    const r = runEditRules(good, DOC, { importance: 3, reviewThreshold: 4 });
    expect(r.decision).toBe("publish");
  });
  it("yüksek önemi review'a düşürür", () => {
    expect(runEditRules(good, DOC, { importance: 4, reviewThreshold: 4 }).decision).toBe("review");
    expect(runEditRules(good, DOC, { importance: 4, reviewThreshold: 5 }).decision).toBe("publish");
  });
  it("uydurma sayıyı reddeder", () => {
    const r = runEditRules({ ...good, dek: "Ceza 7,5 milyon TL'ye çıktı; 15 Kasım 2025'te yürürlükte." }, DOC, { importance: 2, reviewThreshold: 4 });
    expect(r.decision).toBe("reject");
    expect(r.reasons[0]).toMatch(/numericGroundingCheck/);
  });
  it("yasaklı kalıpta ilk denemede retry, ikincide review", () => {
    const bad = { ...good, bodyMarkdown: good.bodyMarkdown + " Uzmanlara göre etkisi büyük olabilir." };
    expect(runEditRules(bad, DOC, { importance: 2, reviewThreshold: 4 }).decision).toBe("retry");
    expect(runEditRules(bad, DOC, { importance: 2, reviewThreshold: 4, isRetry: true }).decision).toBe("review");
  });
  it("uzun başlık, kısa gövde ve boş keyFacts review'a gider", () => {
    const r = runEditRules({ ...good, title: "x".repeat(80), bodyMarkdown: "Kısa.", keyFacts: [] }, DOC, { importance: 2, reviewThreshold: 4 });
    expect(r.decision).toBe("review");
    expect(r.reasons.join(" ")).toMatch(/uzunluk/);
    expect(r.reasons.join(" ")).toMatch(/başlık/);
    expect(r.reasons.join(" ")).toMatch(/keyFacts/);
  });
  it("belgede birebir geçmeyen alıntıyı review'a gönderir", () => {
    const r = runEditRules({ ...good, keyFacts: [{ text: "x", quoteFromSource: "Komisyon beş üyeden oluşur ve Ankara'da toplanır." }] }, DOC, { importance: 2, reviewThreshold: 4 });
    expect(r.decision).toBe("review");
  });
});

describe("kaynağa atıflı tahmin ifadeleri", () => {
  const DOC_TUIK = "Türkiye İstatistik Kurumu: İşsizlik oranı kadınlarda yüzde 11,3 olarak tahmin edildi. Bu yaş grubunda istihdam oranı yüzde 35,8 olarak tahmin edildi.";
  const body = Array.from({ length: 25 }, () => "TÜİK işgücü istatistiklerini açıkladı ve oranlar bir önceki döneme göre değişti.").join(" ");
  const base: WriteOutput = {
    title: "TÜİK işgücü istatistiklerini açıkladı",
    dek: "İşsizlik oranı kadınlarda yüzde 11,3 olarak tahmin edildi.",
    bodyMarkdown: body,
    keyFacts: [{ text: "Kadın işsizliği", quoteFromSource: "İşsizlik oranı kadınlarda yüzde 11,3 olarak tahmin edildi." }],
    tickers: [], tags: ["tuik"], numbersUsed: ["11,3"],
  };
  it("belgede geçen 'tahmin' serbest, kayıt altına alınır", () => {
    const r = runEditRules(base, DOC_TUIK, { importance: 3, reviewThreshold: 4 });
    expect(r.decision).toBe("publish");
    expect(r.banned).toEqual([]);
    expect(r.sourceAttributed.map((b) => b.id)).toEqual(["tahmin"]);
  });
  it("belgede tahmin yoksa aynı ifade yine yasak", () => {
    const r = runEditRules(base, DOC_TUIK.replace(/tahmin edildi/g, "açıklandı"), { importance: 3, reviewThreshold: 4 });
    expect(r.decision).toBe("retry");
  });
  it("'bekleniyor' ve 'olabilir' belgede geçse bile yasak", () => {
    const doc = DOC_TUIK + " Oranın düşmesi bekleniyor; artış olabilir.";
    const r = runEditRules({ ...base, dek: "Oranın düşmesi bekleniyor." }, doc, { importance: 3, reviewThreshold: 4 });
    expect(r.decision).toBe("retry");
    expect(r.banned.map((b) => b.id)).toContain("bekleniyor");
  });
});

describe("uzunluk alt sınırı kısa belgelerde esner", () => {
  const shortDoc = Array.from({ length: 30 }, () => "Merkez Bankası rezerv verilerini açıkladı.").join(" "); // ~150 kelime
  const body = Array.from({ length: 16 }, () => "Merkez Bankası rezerv verilerini açıkladı.").join(" ");  // ~80 kelime
  const art: WriteOutput = { title: "Merkez Bankası rezerv verilerini açıkladı", dek: "Veriler yayımlandı.", bodyMarkdown: body,
    keyFacts: [{ text: "Rezerv", quoteFromSource: "Merkez Bankası rezerv verilerini açıkladı." }], tickers: [], tags: [], numbersUsed: [] };
  it("kısa belgeye kısa haber: geçer", () => expect(runEditRules(art, shortDoc, { importance: 2, reviewThreshold: 4 }).decision).toBe("publish"));
  it("uzun belgede 120 kelime şartı sürer", () => {
    const longDoc = Array.from({ length: 80 }, () => "Merkez Bankası rezerv verilerini açıkladı.").join(" ");
    expect(runEditRules(art, longDoc, { importance: 2, reviewThreshold: 4 }).reasons.join()).toMatch(/uzunluk/);
  });
});
