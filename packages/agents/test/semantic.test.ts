import { describe, expect, it } from "vitest";
import { acceptIssues } from "../src/edit/semantic.js";
import type { VerifyIssue } from "../src/schemas.js";

const DOC = "Tüketici fiyat endeksi (TÜFE) 2026 yılı Eylül ayında bir önceki aya göre yüzde 2,1, bir önceki yılın aynı ayına göre yüzde 28,4 artış gösterdi.";
const ARTICLE = "TÜİK: Eylül'de yıllık enflasyon yüzde 2,1\nTüketici fiyatları Eylül'de yıllık yüzde 2,1 arttı.";
const issue = (p: Partial<VerifyIssue>): VerifyIssue => ({ claim: "yıllık yüzde 2,1 arttı", problem: "baglam", evidence: "bir önceki aya göre yüzde 2,1", explanation: "2,1 aylık değişim.", ...p });

describe("acceptIssues (anlam bulgularının süzgeci)", () => {
  it("iddia haberde, kanıt belgede birebir geçiyorsa bulgu sayılır ve gerekçe üretir", () => {
    const r = acceptIssues([issue({})], ARTICLE, DOC);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toBe('anlam/baglam: "yıllık yüzde 2,1 arttı" — 2,1 aylık değişim.');
  });
  it("denetçinin uydurduğu kanıt ya da haberde olmayan iddia yayını durdurmaz", () => {
    const r = acceptIssues([
      issue({ evidence: "aylık artış yüzde 2,1 olarak açıklandı" }),
      issue({ claim: "enflasyon rekor kırdı" }),
      issue({ evidence: "" }),
    ], ARTICLE, DOC);
    expect(r.ok).toBe(true);
    expect(r.dropped).toHaveLength(3);
  });
  it("desteksiz bulgu kanıtsız da sayılır (olmayanı alıntılayamaz); arka plan da kanıt kaynağıdır", () => {
    expect(acceptIssues([issue({ problem: "desteksiz", evidence: "" })], ARTICLE, DOC).ok).toBe(false);
    const ctx = "[1] 5 Eylül 2026 — TÜİK: Ağustos'ta yıllık enflasyon yüzde 29,1";
    expect(acceptIssues([issue({ problem: "donem", evidence: "Ağustos'ta yıllık enflasyon yüzde 29,1" })], ARTICLE, DOC, ctx).ok).toBe(false);
    expect(acceptIssues([issue({ problem: "donem", evidence: "Ağustos'ta yıllık enflasyon yüzde 29,1" })], ARTICLE, DOC).ok).toBe(true);
  });
});

describe("acceptIssues — açıklamasında kendini geri alan bulgu", () => {
  it("'sorun yoktur' / 'eş anlamlı' diyen bulgu düşer (canlı koşu, TÜİK işgücü flaşı)", () => {
    const r = acceptIssues([issue({ explanation: "'Azalarak' ve 'gerileyen' aynı yönü ifade ettiğinden sorun yoktur." }), issue({ explanation: "Eş anlamlı fiiller." })], ARTICLE, DOC);
    expect(r.ok).toBe(true);
    expect(r.dropped).toHaveLength(2);
  });
});

describe("acceptIssues — denetçinin işaretsiz kısalttığı alıntı (gevşek eşleşme)", () => {
  const LONG = "Tüketici fiyat endeksi (TÜFE) 2026 yılı Eylül ayında bir önceki aya göre yüzde 2,1, bir önceki yılın Aralık ayına göre yüzde 21,6, bir önceki yılın aynı ayına göre yüzde 28,4 ve on iki aylık ortalamalara göre yüzde 33,7 artış gösterdi.";
  it("canlı koşudaki gerçek bulgu (yan cümleler işaretsiz atlanmış) kabul edilir", () => {
    const live = issue({ claim: "TÜİK: Eylül'de yıllık enflasyon yüzde 2,1", problem: "yon", evidence: "Tüketici fiyat endeksi (TÜFE) 2026 yılı Eylül ayında... bir önceki yılın aynı ayına göre yüzde 28,4 artış gösterdi." });
    expect(acceptIssues([live], ARTICLE, LONG).ok).toBe(false);
    const short = issue({ evidence: "bir önceki yılın aynı ayına göre yüzde 28,4 artış gösterdi." });
    expect(acceptIssues([short], ARTICLE, LONG).ok).toBe(false);
  });
  it("belgede olmayan sayı ya da çoğunluğu uydurma kelime dizisi kabul edilmez; kısa kanıt yalnızca birebir", () => {
    const wrongNumber = issue({ evidence: "Tüketici fiyat endeksi (TÜFE) 2026 yılı Eylül ayında bir önceki aya göre yüzde 2,4" });
    expect(acceptIssues([wrongNumber], ARTICLE, LONG).ok).toBe(true);
    const invented = issue({ evidence: "Kurul, enflasyonun Eylül ayında yükselişini sürdürdüğünü ve fiyat artışlarının hızlandığını belirtti" });
    expect(acceptIssues([invented], ARTICLE, LONG).ok).toBe(true);
    expect(acceptIssues([issue({ evidence: "yüzde 28,4 artış" })], ARTICLE, LONG).ok).toBe(true);
  });
});
