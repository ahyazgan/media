import { describe, expect, it } from "vitest";
import { extractNumbers, normalizeNumber, numericGroundingCheck } from "../src/edit/numericGrounding.js";

const DOC = `MADDE 1- 30/5/2018 tarihli ve 30436 sayılı Resmî Gazete'de yayımlanan Yönetmeliğin 7 nci maddesi.
Komisyon üç üyeden oluşur. Ceza tutarı 1.250.750,50 TL; oran %12,5. Bu Yönetmelik 1/10/2025 tarihinde yürürlüğe girer.`;

describe("extractNumbers / normalize", () => {
  it("ayırıcıları tolere eder", () => {
    expect(normalizeNumber("1.250.750,50")).toBe("125075050");
    expect(normalizeNumber("1,250,750.50")).toBe("125075050");
    expect(extractNumbers("30/5/2018 ve 30436 sayılı")).toEqual(["30", "5", "2018", "30436"]);
    expect(extractNumbers("1 250 000 TL")).toEqual(["1250000"]);
  });
});

describe("numericGroundingCheck", () => {
  it("belgedeki sayıları farklı biçimde kabul eder", () => {
    const r = numericGroundingCheck(
      ["30436", "1,250,750.50", "12.5", "1 Ekim 2025"],
      "Ceza 1,250,750.50 TL oldu; oran yüzde 12.5. 1 Ekim 2025'te yürürlükte. 30436 sayılı Gazete.",
      DOC,
    );
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("belgede olmayan sayıyı REDDEDER (model uydurmuş)", () => {
    const r = numericGroundingCheck(["30436", "2.500.000"], "Ceza 2.500.000 TL'ye çıkarıldı.", DOC);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("2.500.000");
  });

  it("modelin listelemediği ama gövdede geçen sayıyı da denetler", () => {
    const r = numericGroundingCheck([], "Yönetmelik 15 Kasım 2026'da yürürlüğe girer.", DOC);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["15 Kasım 2026"]); // tarih kanonik güne göre denetlenir
  });
});

describe("canlı değerlendirmede çıkan biçimler (2026-09-27)", () => {
  it("Türkçe büyüklük sözcükleri değerle eşleşir", () => {
    const tuik = "işsiz sayısı 47 bin kişi azalarak 2 milyon 986 bin kişi oldu. GSYH 14 trilyon 872 milyar 415 milyon TL oldu.";
    expect(numericGroundingCheck(["2 milyon 986 bin", "14 trilyon 872 milyar 415 milyon TL", "47 bin"], "", tuik).missing).toEqual([]);
    const kap = "250.000 adet pay geri alındı. Toplam tutar 10.380.000 TL'dir.";
    expect(numericGroundingCheck(["250 bin", "10,38 milyon"], "250 bin pay için 10,38 milyon TL ödendi.", kap).missing).toEqual([]);
  });
  it("yuvarlama son basamağın yarısı kadar tolere edilir, fazlası reddedilir", () => {
    const doc = "işsiz sayısı 2 milyon 986 bin kişi oldu.";
    expect(numericGroundingCheck(["yaklaşık 3 milyon"], "", doc).ok).toBe(true);   // 2,986 → 3 (birim 1 milyon)
    expect(numericGroundingCheck(["2,9 milyon"], "", doc).ok).toBe(false);        // 2,986 ≠ 2,9 (birim 100 bin)
    expect(numericGroundingCheck(["5 milyon"], "", doc).ok).toBe(false);
  });
  it("saat ve yılsız tarih", () => {
    const doc = "Genel Kurul Tarihi: 20.10.2026\nGenel Kurul Saati: 10:30\nBülten saat 10.00'da yayımlanır.";
    const r = numericGroundingCheck(["20 Ekim", "10:30", "10:00"], "Toplantı 20 Ekim'de saat 10:30'da yapılacak.", doc);
    expect(r.missing).toEqual([]);
    expect(numericGroundingCheck(["11:15"], "", doc).missing).toEqual(["11:15"]);
    expect(numericGroundingCheck(["21 Ekim"], "", doc).missing).toEqual(["21 Ekim"]);
  });
});

describe("canlı değerlendirmede çıkan biçimler (2026-09-27)", () => {
  it("Türkçe büyüklük sözcükleri değerle eşleşir", () => {
    const tuik = "işsiz sayısı 47 bin kişi azalarak 2 milyon 986 bin kişi oldu. GSYH 14 trilyon 872 milyar 415 milyon TL oldu.";
    expect(numericGroundingCheck(["2 milyon 986 bin", "14 trilyon 872 milyar 415 milyon TL", "47 bin"], "", tuik).missing).toEqual([]);
    const kap = "250.000 adet pay geri alındı. Toplam tutar 10.380.000 TL'dir.";
    expect(numericGroundingCheck(["250 bin", "10,38 milyon"], "250 bin pay için 10,38 milyon TL ödendi.", kap).missing).toEqual([]);
  });
  it("yuvarlama son basamağın yarısı kadar tolere edilir, fazlası reddedilir", () => {
    const doc = "işsiz sayısı 2 milyon 986 bin kişi oldu.";
    expect(numericGroundingCheck(["yaklaşık 3 milyon"], "", doc).ok).toBe(true);
    expect(numericGroundingCheck(["2,9 milyon"], "", doc).ok).toBe(false);
    expect(numericGroundingCheck(["5 milyon"], "", doc).ok).toBe(false);
  });
  it("saat ve yılsız tarih", () => {
    const doc = "Genel Kurul Tarihi: 20.10.2026\nGenel Kurul Saati: 10:30\nBülten saat 10.00'da yayımlanır.";
    const r = numericGroundingCheck(["20 Ekim", "10:30", "10:00"], "Toplantı 20 Ekim'de saat 10:30'da yapılacak.", doc);
    expect(r.missing).toEqual([]);
    expect(numericGroundingCheck(["11:15"], "", doc).missing).toEqual(["11:15"]);
    expect(numericGroundingCheck(["21 Ekim"], "", doc).missing).toEqual(["21 Ekim"]);
  });
});
