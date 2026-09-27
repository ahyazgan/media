/**
 * numericGroundingCheck: makalede kullanılan her sayı, belge metninde normalize edilmiş biçimde geçmeli.
 *  - Ayırıcı farkları tolere edilir: "1.250,75" ≡ "1,250.75" → "125075"
 *  - Tarihler kanonik güne indirgenir: "1/10/2025" ≡ "1 Ekim 2025" ≡ "01.10.2025" → D2025-10-01.
 *    Bir tarih, parçaları ayrı ayrı geçiyor diye kabul edilmez; aynı gün belgede geçmeli.
 *  - Diğer bileşik jetonlar ("2024/237") bütün hâliyle ya da tüm parçalarıyla aranır.
 * Bilinçli sınır: tek başına küçük sayılar (ör. "5") belgede başka bağlamda geçebilir; bu kontrol yanlış RED
 * üretmemeye öncelik verir, yanlış KABUL riskini banned/insan onayı katmanına bırakır.
 */

// Ayırıcılar yalnızca rakamlar arasında ("1- 9/12/2022" iki jetondur); boşluklu binlik ayrıca ("1 250 000").
const COMPOSITE_RE = /(?<![\p{L}\d])(?:\d{1,3}(?: \d{3})+|\d+(?:[-.,/]\d+)*)(?![\p{L}\d])/gu;
const MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7,
  ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};
const TEXT_DATE_RE = /(?<!\d)(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\s+(\d{4})(?!\d)/giu;
const NUM_DATE_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

export function normalizeNumber(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/** "1/10/2025" ya da "1 Ekim 2025" → "D2025-10-01"; tarih değilse undefined */
export function dateKey(tok: string): string | undefined {
  const n = NUM_DATE_RE.exec(tok.trim());
  if (n) return key(n[1]!, n[2]!, n[3]!);
  const t = new RegExp(TEXT_DATE_RE.source, "iu").exec(tok.trim());
  if (t && t[0].length === tok.trim().length) return key(t[1]!, String(MONTHS[t[2]!.toLocaleLowerCase("tr")] ?? 0), t[3]!);
  return undefined;
}
const key = (d: string, m: string, y: string) => `D${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

/**
 * Metindeki bileşik sayı jetonları (ayırıcılı sayılar, rakamsal tarihler) + metinsel tarihler, ham biçimde.
 * excludeDateParts: metinsel tarihin rakamları ("15 Kasım 2026" → 15, 2026) ayrı jeton sayılmaz (makale tarafı).
 */
function compositeTokens(text: string, excludeDateParts = false): string[] {
  const out: string[] = [];
  let scan = text;
  for (const m of text.matchAll(TEXT_DATE_RE)) out.push(m[0]);
  if (excludeDateParts) scan = text.replace(TEXT_DATE_RE, " ");
  for (const m of scan.matchAll(COMPOSITE_RE)) {
    const tok = m[0].replace(/^[-.,/\s]+|[-.,/\s]+$/g, "");
    if (/\d/.test(tok)) out.push(tok);
  }
  return out;
}

/** Bileşik jetonu basit sayılara böler: "30/5/2018" → 30,5,2018; "1 250 000" → 1250000 */
function splitParts(tok: string): string[] {
  const bySep = tok.split(/[-/]+/).filter(Boolean);
  const parts: string[] = [];
  for (const p of bySep) {
    const ws = p.trim().split(/\s+/).filter((s) => /\d/.test(s));
    if (ws.length > 1 && !ws.slice(1).every((g) => /^\d{3}$/.test(g))) parts.push(...ws);
    else parts.push(ws.join(""));
  }
  return parts.map((s) => s.replace(/^[.,]+|[.,]+$/g, "")).filter((s) => /\d/.test(s));
}

/** Metindeki sayıları (tarih parçaları ayrılmış hâlde) çıkarır. */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(COMPOSITE_RE)) {
    const tok = m[0].replace(/^[-.,/\s]+|[-.,/\s]+$/g, "");
    if (/\d/.test(tok)) out.push(...splitParts(tok));
  }
  return out;
}

export function numberTokenSet(text: string): Set<string> {
  const set = new Set<string>();
  for (const tok of compositeTokens(text)) {
    const dk = dateKey(tok);
    if (dk) set.add(dk);
    set.add(normalizeNumber(tok));
    for (const n of splitParts(tok)) {
      set.add(normalizeNumber(n));
      const m = /^(.*?)[.,](\d{1,2})$/.exec(n);
      if (m) { set.add(normalizeNumber(m[1]!)); set.add(normalizeNumber(m[1]!) + m[2]!); }
    }
  }
  return set;
}

export interface GroundingResult { ok: boolean; missing: string[]; checked: number }

export function numericGroundingCheck(numbersUsed: string[], articleText: string, documentText: string): GroundingResult {
  const docSet = numberTokenSet(documentText);
  const candidates = new Set<string>([...numbersUsed, ...compositeTokens(articleText, true)]);
  const missing: string[] = [];
  for (const c of candidates) {
    const dk = dateKey(c);
    if (dk) { if (!docSet.has(dk)) missing.push(c); continue; }
    const norm = normalizeNumber(c);
    if (!norm || docSet.has(norm)) continue;
    const parts = splitParts(c);
    if (parts.length > 1 && parts.every((p) => docSet.has(normalizeNumber(p)))) continue;
    missing.push(c);
  }
  return { ok: missing.length === 0, missing, checked: candidates.size };
}
