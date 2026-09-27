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
