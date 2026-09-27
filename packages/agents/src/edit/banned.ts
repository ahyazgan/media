/**
 * Yasaklı kalıplar: tavsiye, tahmin, abartı. Eşleşme → write bir kez daha denenir, tekrar eşleşirse review.
 * JS'te \\b yalnızca ASCII harf tanır; Türkçe için kalıplardaki \\b Unicode harf sınırına çevrilir.
 * Kalıp eklerken test/banned.test.ts'e olumlu/olumsuz örnek ekle.
 */
export interface BannedPattern { id: string; re: RegExp; kind: "tavsiye" | "tahmin" | "abarti" | "kaynaksiz" }

const B = "(?:(?<=\\p{L})(?!\\p{L})|(?<!\\p{L})(?=\\p{L}))";
const w = (src: string) => new RegExp(src.split("\\b").join(B), "iu");

export const BANNED: BannedPattern[] = [
  // Tahmin / spekülasyon
  { id: "olabilir", kind: "tahmin", re: w("\\bolabil(ir|ecek|eceği)\\b") },
  { id: "bekleniyor", kind: "tahmin", re: w("\\bbeklen(iyor|mekte|en|ti|tisi|tiler)\\b") },
  { id: "ongoruluyor", kind: "tahmin", re: w("\\böngör(ü|ül)") },
  { id: "tahmin", kind: "tahmin", re: w("\\btahmin") },
  { id: "muhtemel", kind: "tahmin", re: w("\\bmuhtemel|\\bbüyük ihtimalle\\b|\\bolası\\b") },
  { id: "gelecekte", kind: "tahmin", re: w("\\bileride\\b|\\bönümüzdeki dönemde\\b") },
  // Kaynaksız atıf
  { id: "uzmanlara-gore", kind: "kaynaksiz", re: w("\\buzmanlar(a göre|ın görüşüne)|\\banalistler(e göre|in)\\b|\\bpiyasa(da|lar) (bekl|konuş)") },
  { id: "iddia", kind: "kaynaksiz", re: w("\\biddia (ed|olun)|\\bsöylenti") },
  // Tavsiye
  { id: "tavsiye", kind: "tavsiye", re: w("\\btavsiye|\\böneri(l|y|r)|\\bönerilir\\b") },
  { id: "al-sat", kind: "tavsiye", re: w("\\b(alım|satım|al|sat) (fırsatı|zamanı|sinyali)\\b|\\bpozisyon al") },
  { id: "hedef-fiyat", kind: "tavsiye", re: w("\\bhedef fiyat") },
  { id: "yatirimci-icin", kind: "tavsiye", re: w("\\byatırımcılar(ın|a)? (için|dikkat)") },
  { id: "gerekir-meli", kind: "tavsiye", re: w("\\b(almalı|satmalı|değerlendirmeli|kaçırmamalı)(sınız|dır)?\\b") },
  // Abartı / clickbait
  { id: "sok", kind: "abarti", re: w("\\bşok\\b|\\bflaş\\b|\\bbomba\\b|\\bçılgın\\b|\\bmuazzam\\b|\\binanılmaz\\b|\\bkaçırılmaz\\b") },
  { id: "dev", kind: "abarti", re: w("\\bdev (adım|karar|hamle|değişiklik)\\b|\\btarihi (karar|adım)\\b") },
  { id: "kesinlikle", kind: "abarti", re: w("\\bkesinlikle\\b|\\bmutlaka\\b") },
  { id: "herkes", kind: "abarti", re: w("\\bherkesi (etkile|ilgilendir)|\\bmilyonlar(ı|ca)\\b") },
];

export interface BannedHit { id: string; kind: BannedPattern["kind"]; match: string; field: string }

export function findBanned(fields: Record<string, string>): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const [field, text] of Object.entries(fields)) {
    for (const p of BANNED) {
      const m = p.re.exec(text);
      if (m) hits.push({ id: p.id, kind: p.kind, match: m[0], field });
    }
  }
  return hits;
}
