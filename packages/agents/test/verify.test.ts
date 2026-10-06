import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptIssues } from "../src/edit/semantic.js";
import { checkFlash } from "../src/edit/rules.js";
import { hasApiKey } from "../src/client.js";

/**
 * Anlam doğrulaması — canlı model (LIVE=1). Bozuk örneklerin hepsi sayı kontrolünden GEÇER (sayılar belgede var); yalnızca anlam
 * denetçisi yakalayabilir. Doğru örneklerde bulgu olmamalı (yanlış alarm flaşı durdurur).
 */
const doc = (p: string) => readFileSync(new URL(`../fixtures/${p}/document.txt`, import.meta.url), "utf8");
const TCMB = doc("tcmb/01-ppk-faiz-karari");
const TUFE = doc("tuik/01-tufe");

type Case = [name: string, sourceId: string, document: string, title: string, dek: string];
const broken: Case[] = [
  ["yön: indirim → artırım", "tcmb", TCMB, "TCMB politika faizini yüzde 35'e yükseltti", "Para Politikası Kurulu bir hafta vadeli repo ihale faiz oranını yüzde 36,5'ten yüzde 35'e yükseltti."],
  ["bağlam: aylık değer yıllık diye", "tuik", TUFE, "TÜİK: Eylül'de yıllık enflasyon yüzde 2,1", "Tüketici fiyat endeksi Eylül'de bir önceki yılın aynı ayına göre yüzde 2,1 arttı."],
  ["dönem: Eylül verisi Ağustos diye", "tuik", TUFE, "TÜİK: Ağustos'ta yıllık enflasyon yüzde 28,4", "Tüketici fiyat endeksi Ağustos'ta yıllık yüzde 28,4, aylık yüzde 2,1 arttı."],
  ["bağlam: koridorun üst ucu politika faizi diye", "tcmb", TCMB, "TCMB politika faizini yüzde 38'e indirdi", "Para Politikası Kurulu politika faizini yüzde 38'e, gecelik borçlanma faizini yüzde 33,5'e indirdi."],
  ["olumsuzluk: sıkı duruş gevşetilecek diye", "tcmb", TCMB, "TCMB faizi yüzde 35'e indirdi, sıkı duruşu sonlandırdı", "Kurul, sıkı para politikası duruşunun sona erdirileceğini ve politika faizinin yüzde 35'e indirildiğini açıkladı."],
  ["atıf: kararı Bakanlık verdi diye", "tcmb", TCMB, "Hazine ve Maliye Bakanlığı politika faizini yüzde 35'e indirdi", "Bakanlık, bir hafta vadeli repo ihale faiz oranını yüzde 36,5'ten yüzde 35'e indirdi."],
  ["desteksiz: beklenti karşılaştırması", "tcmb", TCMB, "TCMB faizi beklentilerin üzerinde indirerek yüzde 35'e çekti", "Kurul, piyasa beklentilerinin üzerinde bir indirimle politika faizini yüzde 36,5'ten yüzde 35'e çekti."],
];
const correct: Case[] = [
  ["TCMB faiz flaşı", "tcmb", TCMB, "TCMB politika faizini yüzde 35'e indirdi", "Para Politikası Kurulu, bir hafta vadeli repo ihale faiz oranını yüzde 36,5'ten yüzde 35'e indirdi."],
  ["TÜFE flaşı", "tuik", TUFE, "TÜİK: Eylül'de yıllık enflasyon yüzde 28,4", "Tüketici fiyat endeksi Eylül'de aylık yüzde 2,1, yıllık yüzde 28,4 arttı."],
  ["TCMB koridor + özet tarihi (yeniden kurulmuş cümle)", "tcmb", TCMB, "Merkez Bankası politika faizini yüzde 36,5'ten yüzde 35'e düşürdü", "Kurul gecelik borç verme faizini yüzde 38'e, borçlanma faizini yüzde 33,5'e indirdi; toplantı özeti 29 Ekim'de yayımlanacak."],
];

const live = process.env.LIVE === "1" && hasApiKey();
describe.skipIf(!live)("anlam doğrulaması — canlı model (LIVE=1)", () => {
  const check = async (sourceId: string, document: string, title: string, dek: string) => {
    const { verify } = await import("../src/verify.js");
    const v = await verify({ sourceId, documentText: document, title, dek });
    return acceptIssues(v.issues, `${title}\n${dek}`, document);
  };

  it.each(broken)("yakalar — %s", async (_n, sourceId, document, title, dek) => {
    const numbers = checkFlash({ headline: title, sentence: dek, numbersUsed: [] }, document);
    expect(numbers.reasons.filter((r) => /sayı/.test(r))).toEqual([]); // sayı kontrolü bunu göremez
    const r = await check(sourceId, document, title, dek);
    expect(r.ok, `bulgu yok (süzülen: ${JSON.stringify(r.dropped)})`).toBe(false);
  }, 60_000);

  it.each(correct)("yanlış alarm vermez — %s", async (_n, sourceId, document, title, dek) => {
    const r = await check(sourceId, document, title, dek);
    expect(r.ok, r.reasons.join(" | ")).toBe(true);
  }, 60_000);

  // Gerçek KAP bildirimleri (tablolu PDF metni) ve o gün yazılan haberler: fixtures/verify/README.md
  const kapCases = readdirSync(new URL("../fixtures/verify/", import.meta.url)).filter((d) => d.startsWith("kap-"));
  const kapFlags: string[] = [];
  it.each(kapCases)("gerçek KAP: %s", async (d) => {
    const base = new URL(`../fixtures/verify/${d}/`, import.meta.url);
    const document = readFileSync(new URL("document.txt", base), "utf8");
    const a = JSON.parse(readFileSync(new URL("article.json", base), "utf8")) as { title: string; dek: string; bodyMarkdown: string; keyFacts: string[] };
    const { expect: kind, note } = JSON.parse(readFileSync(new URL("expected.json", base), "utf8")) as { expect: "temiz" | "hata"; note?: string };
    const { verify } = await import("../src/verify.js");
    const body = [a.bodyMarkdown, ...a.keyFacts.map((k) => `- ${k}`)].join("\n\n");
    const v = await verify({ sourceId: "kap", documentText: document, title: a.title, dek: a.dek, body });
    const r = acceptIssues(v.issues, `${a.title}\n${a.dek}\n${body}`, document);
    if (kind === "hata") expect(r.ok, `yakalanmadı: ${note}`).toBe(false);
    else if (!r.ok) kapFlags.push(`${d}: ${r.reasons.join(" | ")}`);
  }, 90_000);
  it("gerçek KAP: doğru haberlerde yanlış alarm en çok 1", () => {
    if (kapFlags.length) console.log(`gerçek KAP yanlış alarmları (${kapFlags.length}):\n${kapFlags.join("\n")}`);
    expect(kapFlags.length, kapFlags.join("\n")).toBeLessThanOrEqual(1);
  });
});
