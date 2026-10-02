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

describe("canlı KAP denemesinde çıkan biçimler (2026-10-02)", () => {
  const kapDoc = `KAP'ta yayınlanma tarihi ve saati: 02.10.2026 16:04:43
Şirketimiz, Amerika Birleşik Devletleri'nde tesis edilmek üzere, 100–228 MVA aralığında güç transformatörlerinin tedariğine yönelik toplam 90 milyon ABD Doları tutarında sipariş teyidi almıştır.`;
  it("yazarın listelediği bileşik ifadeler parçalarıyla doğrulanır", () => {
    expect(numericGroundingCheck(["100–228 MVA", "02.10.2026 16:04:43", "90 milyon"], "", kapDoc).missing).toEqual([]);
  });
  it("bileşik ifadedeki tek bir uydurma parça yine reddedilir", () => {
    expect(numericGroundingCheck(["100–250 MVA"], "", kapDoc).missing).toEqual(["100–250 MVA"]);
    expect(numericGroundingCheck(["02.10.2026 17:04:43"], "", kapDoc).missing).toEqual(["02.10.2026 17:04:43"]);
  });
});

describe("büyüklük sözcüğünün parçası olan çıplak sayı (2026-10-02 flaş testi)", () => {
  const doc = "Dönem net kârı 2.115.000.000 TL olmuş ve yüzde 42,9 artmıştır.";
  it("'2.115 milyon' metindeyse numbersUsed'daki '2.115' ayrıca aranmaz", () => {
    expect(numericGroundingCheck(["2.115", "42,9"], "Net kâr 2.115 milyon TL oldu; artış yüzde 42,9.", doc).missing).toEqual([]);
  });
  it("aynı sayı metinde büyüklük sözcüğü olmadan geçiyorsa yine aranır; yanlış değer reddedilir", () => {
    expect(numericGroundingCheck(["2.115"], "Kâr 2.115 TL oldu.", doc).missing).toEqual(["2.115"]);
    expect(numericGroundingCheck(["2.215"], "Net kâr 2.215 milyon TL oldu.", doc).ok).toBe(false);
  });
});

describe("ekli büyüklük sözcükleri ve listede fazladan sayı (2026-10-02 flaş testi)", () => {
  const doc = "Ödenmiş sermaye 400.000.000 TL'den 1.000.000.000 TL'ye bedelsiz olarak artırılacaktır. Sınır yüzde 5'ten yüzde 10'a yükseltilmiştir.";
  it("'400 milyondan 1 milyara' değeriyle doğrulanır", () => {
    expect(numericGroundingCheck(["400", "1"], "Sermaye 400 milyondan 1 milyara çıkıyor.", doc).missing).toEqual([]);
    expect(numericGroundingCheck([], "Sermaye 450 milyondan 1 milyara çıkıyor.", doc).ok).toBe(false);
  });
  it("metinde geçmeyen, listeye fazladan yazılmış sayı haberi düşürmez; metindeki uydurma sayı yine düşürür", () => {
    expect(numericGroundingCheck(["11", "5", "10"], "Sınır yüzde 5'ten yüzde 10'a çıktı.", doc).missing).toEqual([]);
    expect(numericGroundingCheck(["5"], "Sınır yüzde 5'ten yüzde 11'e çıktı.", doc).missing).toEqual(["11"]);
  });
  it("'bina' büyüklük sözcüğü sayılmaz", () => {
    expect(numericGroundingCheck([], "3 bina yıkıldı.", "3 bina yıkıldı.").ok).toBe(true);
  });
});

describe("KAP PDF form alanları ve noktalı saat (2026-10-02 canlı KAP)", () => {
  const doc = "KAP'ta yayınlanma tarihi ve saati: 02.10.2026 17:48:10\nBölünmeye İlişkin SPK Onay Tarihi24.06.2026\nYönetim Kurulu Karar Tarihi26.02.2026";
  it("etikete bitişik tarih belgede bulunur", () => {
    expect(numericGroundingCheck(["26.02.2026", "24.06.2026"], "Karar 26.02.2026'da alındı, SPK 24.06.2026'da onayladı.", doc).missing).toEqual([]);
  });
  it("noktalı saat belgedeki saatle eşleşir; belgede olmayan saat reddedilir", () => {
    expect(numericGroundingCheck(["17.48.10"], "Açıklama saat 17.48.10'da yayımlandı.", doc).missing).toEqual([]);
    expect(numericGroundingCheck(["18.48.10"], "Açıklama saat 18.48.10'da yayımlandı.", doc).ok).toBe(false);
  });
});
