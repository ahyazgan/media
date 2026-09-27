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
