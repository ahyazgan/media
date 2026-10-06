import { describe, expect, it } from "vitest";
import { joinPdfLine } from "./extract.js";

/** pdf.js metin parçası: transform = [ölçek, 0, 0, ölçek, x, y] */
const item = (str: string, x: number, y: number, width: number, size = 6.8) => ({ str, width, transform: [size, 0, 0, size, x, y] });

describe("joinPdfLine (PDF satır birleştirme)", () => {
  it("tablo hücreleri bitişmez: KAP pay geri alım satırı (gerçek PDF konumları, bildirim 1672540)", () => {
    const row = [
      item("05.10.2026", 121.6, 277.7, 30.2), item("100.000", 187.5, 277.7, 21.8), item("0,02491", 255.9, 277.7, 21.8),
      item("5,294", 308.3, 277.7, 15.1), item("118.313", 407.6, 277.7, 21.8), item("-", 530, 277.7, 2.1),
    ];
    expect(joinPdfLine(row)).toBe("05.10.2026 | 100.000 | 0,02491 | 5,294 | 118.313 | -");
  });

  it("kelime içi bölünme birleşik kalır, kelime aralığı tek boşluk olur, satır değişimi korunur", () => {
    expect(joinPdfLine([item("alınmıştır. G", 44.3, 193.2, 34.1), item("eri alınan", 78.4, 193.2, 30)])).toBe("alınmıştır. Geri alınan");
    expect(joinPdfLine([item("Geri", 10, 50, 12), item("alınan", 24, 50, 18)])).toBe("Geri alınan");
    expect(joinPdfLine([item("Geri ", 10, 50, 14), item("alınan", 24, 50, 18)])).toBe("Geri alınan");
    expect(joinPdfLine([item("Ek Açıklamalar", 48, 243.2, 64.8), item("Şirketimizin", 44.3, 219.1, 40)])).toBe("Ek Açıklamalar\nŞirketimizin");
  });
});
