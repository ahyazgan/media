/**
 * numericGroundingCheck: makalede kullanılan her sayı belge metninde geçmeli.
 *  - Ayırıcı farkları: "1.250,75" ≡ "1,250.75" → "125075"
 *  - Tarihler kanonik güne indirgenir: "1/10/2025" ≡ "1 Ekim 2025" ≡ "01.10.2025" → D2025-10-01; yılsız "20 Ekim" → M10-20
 *  - Saatler: "10:30" ≡ belgede "10:30" ya da "saat 10.30" → T10:30
 *  - Türkçe büyüklük sözcükleri değerle karşılaştırılır: "250 bin" ≡ "250.000"; "10,38 milyon" ≡ "10.380.000";
 *    "2 milyon 986 bin" ≡ "2.986.000". Yuvarlama yazılan son basamağın yarısı kadar tolere edilir ("yaklaşık 3 milyon").
 * Bilinçli sınır: tek başına küçük sayılar (ör. "5") belgede başka bağlamda geçebilir; kontrol yanlış RED üretmemeye
 * öncelik verir, yanlış KABUL riskini banned/insan onayı katmanına bırakır.
 */

// Ayırıcılar yalnızca rakamlar arasında ("1- 9/12/2022" iki jetondur); boşluklu binlik ayrıca ("1 250 000").
const COMPOSITE_RE = /(?<![\p{L}\d])(?:\d{1,3}(?: \d{3})+|\d+(?:[-.,/]\d+)*)(?![\p{L}\d])/gu;
const MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7,
  ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};
/** Gün + ay (+ isteğe bağlı yıl): "20 Ekim", "1 Ekim 2025" */
const TEXT_DATE_RE = /(?<!\d)(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+(\d{4}))?(?![\p{L}\d])/giu;
/** Belge tarafı: ekli biçimleri de yakala ("20 Ekim'de") */
const TEXT_DATE_LOOSE_RE = /(?<!\d)(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+(\d{4}))?/giu;
const TEXT_DATE_EXACT_RE = /^(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+(\d{4}))?$/iu;
const NUM_DATE_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
const SCALE: Record<string, number> = { bin: 1e3, milyon: 1e6, milyar: 1e9, trilyon: 1e12 };
/** "14 trilyon 872 milyar 415 milyon" gibi zincirler dahil */
const SCALED_RE = /(?<![\p{L}\d])\d[\d.,]*\s*(?:trilyon|milyar|milyon|bin)(?![\p{L}])(?:\s+\d[\d.,]*\s*(?:trilyon|milyar|milyon|bin)(?![\p{L}]))*/giu;
const SCALED_ONE_RE = /(?<![\p{L}\d])\d[\d.,]*\s*(?:trilyon|milyar|milyon|bin)(?![\p{L}])(?:\s+\d[\d.,]*\s*(?:trilyon|milyar|milyon|bin)(?![\p{L}]))*/iu;
const SCALE_PART_RE = /(\d[\d.,]*)\s*(trilyon|milyar|milyon|bin)/giu;
const TIME_COLON_RE = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g;
const TIME_SAAT_RE = /saat\s+([01]?\d|2[0-3])[.:]([0-5]\d)(?!\d)/giu;
const TIME_EXACT_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function normalizeNumber(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

const key = (d: string, m: string, y: string) => `D${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
const mkey = (d: string | number, m: string | number) => `M${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const tkey = (h: string, m: string) => `T${h.padStart(2, "0")}:${m}`;
const vkey = (v: number) => `V${Math.round(v * 100)}`;
const monthOf = (name: string) => MONTHS[name.toLocaleLowerCase("tr")];

/** "1/10/2025" → D-anahtar; "1 Ekim 2025" → D-anahtar; "20 Ekim" → M-anahtar; tarih değilse undefined */
export function dateKey(tok: string): string | undefined {
  const t = tok.trim();
  const n = NUM_DATE_RE.exec(t);
  if (n) return key(n[1]!, n[2]!, n[3]!);
  const x = TEXT_DATE_EXACT_RE.exec(t);
  if (x) {
    const m = String(monthOf(x[2]!) ?? 0);
    return x[3] ? key(x[1]!, m, x[3]) : mkey(x[1]!, m);
  }
  return undefined;
}

/** Türkçe sayı yazımını değere çevirir: "10.380.000" → 10380000, "10,38" → 10.38, "1.250,75" → 1250.75 */
export function parseTrNumber(s: string): number | undefined {
  const t = s.trim();
  if (!/^\d[\d.,]*$/.test(t)) return undefined;
  let v: string;
  if (t.includes(",")) v = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) v = t.replace(/\./g, "");
  else v = t;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** "2 milyon 986 bin" → { value: 2986000, unit: 1000 }; unit = yazılan son basamağın değeri (yuvarlama toleransı için) */
export function parseScaled(expr: string): { value: number; unit: number } | undefined {
  let value = 0, unit = Infinity, any = false;
  for (const m of expr.matchAll(SCALE_PART_RE)) {
    const num = parseTrNumber(m[1]!);
    const sc = SCALE[m[2]!.toLocaleLowerCase("tr")]!;
    if (num === undefined) return undefined;
    value += num * sc;
    const decimals = m[1]!.includes(",") ? m[1]!.split(",")[1]!.length : 0;
    unit = Math.min(unit, sc / 10 ** decimals);
    any = true;
  }
  return any ? { value, unit } : undefined;
}

/**
 * Metindeki aday jetonlar (ham biçimde): büyüklük sözcüklü sayılar, metinsel tarihler, saatler, bileşik sayılar.
 * Makale tarafında (excludeParts) tanınan birimlerin rakamları ayrıca aday sayılmaz ("250 bin" → "250" ayrıca aranmaz).
 */
function compositeTokens(text: string, excludeParts = false): string[] {
  const out: string[] = [];
  let scan = text;
  for (const re of [SCALED_RE, TEXT_DATE_RE, TIME_COLON_RE]) {
    for (const m of scan.matchAll(re)) out.push(m[0]);
    if (excludeParts) scan = scan.replace(re, " ");
  }
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

export interface DocIndex { tokens: Set<string>; values: number[] }

export function indexDocument(text: string): DocIndex {
  const tokens = new Set<string>();
  const values: number[] = [];
  const addValue = (v: number | undefined) => { if (v !== undefined) { values.push(v); tokens.add(vkey(v)); } };
  for (const m of text.matchAll(SCALED_RE)) addValue(parseScaled(m[0])?.value);
  for (const m of text.matchAll(TEXT_DATE_LOOSE_RE)) {
    const mo = monthOf(m[2]!);
    if (mo) { tokens.add(mkey(m[1]!, mo)); if (m[3]) tokens.add(key(m[1]!, String(mo), m[3])); }
  }
  for (const m of text.matchAll(TIME_COLON_RE)) tokens.add(tkey(m[1]!, m[2]!));
  for (const m of text.matchAll(TIME_SAAT_RE)) tokens.add(tkey(m[1]!, m[2]!));
  for (const tok of compositeTokens(text)) {
    const dk = dateKey(tok);
    if (dk) {
      tokens.add(dk);
      const n = NUM_DATE_RE.exec(tok.trim());
      if (n) tokens.add(mkey(n[1]!, n[2]!));
    }
    tokens.add(normalizeNumber(tok));
    addValue(parseTrNumber(tok));
    for (const n of splitParts(tok)) {
      tokens.add(normalizeNumber(n));
      const m = /^(.*?)[.,](\d{1,2})$/.exec(n);
      if (m) { tokens.add(normalizeNumber(m[1]!)); tokens.add(normalizeNumber(m[1]!) + m[2]!); }
    }
  }
  return { tokens, values };
}

export function numberTokenSet(text: string): Set<string> {
  return indexDocument(text).tokens;
}

function grounded(c: string, idx: DocIndex): boolean {
  const t = c.trim();
  // 1) büyüklük sözcüklü sayı: değerle, yuvarlama toleransıyla
  const sc = SCALED_ONE_RE.exec(t);
  if (sc) {
    const p = parseScaled(sc[0]);
    if (p) return idx.tokens.has(vkey(p.value)) || idx.values.some((v) => Math.abs(v - p.value) <= p.unit / 2 + 1e-9);
  }
  // 2) saat
  const tm = TIME_EXACT_RE.exec(t);
  if (tm) return idx.tokens.has(tkey(tm[1]!, tm[2]!));
  // 3) tarih (tam ya da yılsız)
  const dk = dateKey(t);
  if (dk) return idx.tokens.has(dk);
  // 4) düz sayı: rakam dizisi, değer ya da bileşik parçalar
  const norm = normalizeNumber(t);
  if (!norm) return true;
  if (idx.tokens.has(norm)) return true;
  const v = parseTrNumber(t);
  if (v !== undefined && idx.tokens.has(vkey(v))) return true;
  const parts = splitParts(t);
  return parts.length > 1 && parts.every((p) => idx.tokens.has(normalizeNumber(p)));
}

export interface GroundingResult { ok: boolean; missing: string[]; checked: number }

export function numericGroundingCheck(numbersUsed: string[], articleText: string, documentText: string): GroundingResult {
  const idx = indexDocument(documentText);
  const candidates = new Set<string>([...numbersUsed, ...compositeTokens(articleText, true)]);
  const missing = [...candidates].filter((c) => !grounded(c, idx));
  return { ok: missing.length === 0, missing, checked: candidates.size };
}
