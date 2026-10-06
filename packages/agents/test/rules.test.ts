import { describe, expect, it } from "vitest";
import { runEditRules, quoteAppearsIn, checkFlash } from "../src/edit/rules.js";
import { formatBackground, writeUserMessage } from "../src/prompts.js";
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
  it("resmi listedeki yayın zamanı (groundingExtra) sayı kontrolünde kabul edilir, yalnızca o", () => {
    const withTime = { ...good, dek: "Bildirim 02.10.2026 15:57:25'te yayımlandı; değişiklik 1 Ekim 2025'te yürürlüğe giriyor." };
    expect(runEditRules(withTime, DOC, { importance: 2, reviewThreshold: 4 }).decision).toBe("reject");
    expect(runEditRules(withTime, DOC, { importance: 2, reviewThreshold: 4, groundingExtra: "02.10.2026 15:57:25 2 Ekim 2026 15:57" }).decision).toBe("publish");
    const invented = { ...withTime, dek: withTime.dek + " Tutar 4,2 milyon TL." };
    expect(runEditRules(invented, DOC, { importance: 2, reviewThreshold: 4, groundingExtra: "02.10.2026 15:57:25" }).decision).toBe("reject");
  });
  it("arka plan (contextText): gövdenin son paragrafında sayı kabul edilir; başlık/dek/ilk paragrafa taşınırsa review, uydurma sayı yine reject", () => {
    const ctx = formatBackground([{ date: "12 Eylül 2025", title: "Uzlaşma komisyonu yönetmeliği", dek: "Komisyon sayısı 81 ile çıkarıldı.", facts: [] }]);
    const withBg = { ...good, bodyMarkdown: `${good.bodyMarkdown}\n\nBakanlık 12 Eylül 2025'te komisyon sayısını 81 olarak açıklamıştı.` };
    expect(runEditRules(withBg, DOC, { importance: 2, reviewThreshold: 4 }).decision).toBe("reject");
    expect(runEditRules(withBg, DOC, { importance: 2, reviewThreshold: 4, contextText: ctx }).decision).toBe("publish");
    const inLead = { ...withBg, dek: "Komisyon sayısı 81'e çıkıyor; değişiklik 1 Ekim 2025'te yürürlükte." };
    const r = runEditRules(inLead, DOC, { importance: 2, reviewThreshold: 4, contextText: ctx });
    expect(r.decision).toBe("review");
    expect(r.reasons.join(" ")).toMatch(/arka plan: .*81/);
    const invented = { ...withBg, bodyMarkdown: `${withBg.bodyMarkdown} Bütçe 9,9 milyon TL.` };
    expect(runEditRules(invented, DOC, { importance: 2, reviewThreshold: 4, contextText: ctx }).decision).toBe("reject");
  });
  it("yazar mesajı: arka plan belgeden sonra, ayrı blokta; yoksa blok yok", () => {
    const base = { sourceName: "KAP", sourceUrl: "u", title: "t", publishedAt: "p", summaryHint: "s", category: "borsa", documentText: "BELGE" };
    expect(writeUserMessage(base)).not.toContain("ARKA PLAN");
    const m = writeUserMessage({ ...base, background: [{ date: "2 Ekim 2026", title: "Önceki", dek: "Spot", facts: ["Olgu 1", "Olgu 2"] }] });
    expect(m.indexOf("--- BELGE METNİ SONU ---")).toBeLessThan(m.indexOf("--- ARKA PLAN"));
    expect(m).toContain("[1] 2 Ekim 2026 — Önceki");
    expect(m).toContain("Olgular: Olgu 1 / Olgu 2");
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

describe("kısaltılmış alıntı", () => {
  const doc = "TÜFE Eylül ayında bir önceki aya göre yüzde 2,1, bir önceki yılın Aralık ayına göre yüzde 21,6, bir önceki yılın aynı ayına göre yüzde 28,4 artış gösterdi.";
  it("parçalar sırayla geçiyorsa kabul", () => expect(quoteAppearsIn("TÜFE Eylül ayında bir önceki aya göre yüzde 2,1, ... yüzde 28,4 artış gösterdi.", doc)).toBe(true));
  it("parçalardan biri belgede yoksa ya da sıra bozuksa ret", () => {
    expect(quoteAppearsIn("TÜFE Eylül ayında … yüzde 35 artış gösterdi.", doc)).toBe(false);
    expect(quoteAppearsIn("yüzde 28,4 artış gösterdi … TÜFE Eylül ayında", doc)).toBe(false);
  });
});

describe("uzunluk tabanı ve borsa kodu satırı", () => {
  it("lengthBasisText alt sınırı kalıp metinden arınmış belgeye göre hesaplar", () => {
    const longDoc = DOC + " " + Array.from({ length: 300 }, () => "beyan").join(" ");
    const short = { ...good, bodyMarkdown: Array.from({ length: 70 }, () => "Komisyon").join(" ") + " üç üyeden oluşur." };
    expect(runEditRules(short, longDoc, { importance: 2, reviewThreshold: 4 }).reasons.join(" ")).toMatch(/uzunluk/);
    expect(runEditRules(short, longDoc, { importance: 2, reviewThreshold: 4, lengthBasisText: DOC }).reasons.join(" ")).not.toMatch(/uzunluk/);
  });
  it("writeUserMessage kod verilirse 'Borsa kodu' satırı ekler", () => {
    const base = { sourceName: "KAP", sourceUrl: "https://x", title: "T", publishedAt: "2026-10-02", summaryHint: "h", category: "borsa", documentText: "d" };
    expect(writeUserMessage({ ...base, stockCodes: ["NRBNK", "NYB"] })).toContain("\nBorsa kodu: NRBNK, NYB\n");
    expect(writeUserMessage(base)).not.toContain("Borsa kodu");
  });
});

describe("checkFlash", () => {
  const doc = "Kurul politika faizini yüzde 36,5'ten yüzde 35'e indirmiştir.";
  it("belgeye dayalı kısa flaşı kabul eder", () => {
    expect(checkFlash({ headline: "TCMB faizi yüzde 35'e indirdi", sentence: "Kurul faizi yüzde 36,5'ten yüzde 35'e indirdi.", numbersUsed: ["35", "36,5"] }, doc).ok).toBe(true);
  });
  it("uydurma sayı, yasaklı ifade ve uzun başlığı reddeder", () => {
    expect(checkFlash({ headline: "TCMB faizi yüzde 34'e indirdi", sentence: "Kurul faizi indirdi.", numbersUsed: ["34"] }, doc).reasons.join(" ")).toMatch(/34/);
    expect(checkFlash({ headline: "TCMB faizi indirdi", sentence: "Piyasaların olumlu karşılaması bekleniyor.", numbersUsed: [] }, doc).ok).toBe(false);
    expect(checkFlash({ headline: "x".repeat(91), sentence: "Kurul faizi indirdi.", numbersUsed: [] }, doc).reasons.join(" ")).toMatch(/90/);
  });
});
