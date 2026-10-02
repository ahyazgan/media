import { findBanned, type BannedHit } from "./banned.js";
import { numericGroundingCheck, type GroundingResult } from "./numericGrounding.js";
import type { FlashOutput, WriteOutput } from "../schemas.js";

export type EditDecision = "publish" | "review" | "reject" | "retry";

export interface EditResult {
  decision: EditDecision;
  reasons: string[];
  grounding: GroundingResult;
  banned: BannedHit[];
  /** Kaynağın kendi ifadesi olduğu için serbest bırakılan eşleşmeler (ör. TÜİK "tahmin edildi") */
  sourceAttributed: BannedHit[];
}

/**
 * Kurumların resmi olarak yayımladığı tahminler (TÜİK "yüzde 11,3 olarak tahmin edildi", TCMB enflasyon tahmini)
 * haberin kendisidir. Bu kalıplar yalnızca aynı kök belgede geçiyorsa serbesttir; "olabilir", "bekleniyor",
 * tavsiye ve abartı kalıpları her durumda yasaktır.
 */
const SOURCE_ATTRIBUTABLE: Record<string, string> = { tahmin: "tahmin", ongoruluyor: "öngör" };

export interface EditOptions {
  importance: number;
  reviewThreshold: number;
  /** Bu, yasaklı kalıp yüzünden yapılan ikinci deneme mi? */
  isRetry?: boolean;
  minWords?: number;
  maxWords?: number;
  maxTitleChars?: number;
  /**
   * Yalnızca sayı kontrolüne eklenen güvenilir üst veri (kaynağın resmi listesindeki yayın zamanı gibi). Yazar "Yayın tarihi"ni
   * habere geçirebilir; KAP PDF'indeki saat listedekinden bir saniye sapabildiği için belge metninde bulunmayabilir.
   */
  groundingExtra?: string;
  /** Uzunluk alt sınırı bu metnin kelime sayısından hesaplanır (kaynağın sabit kalıplarından arınmış belge); yoksa belge */
  lengthBasisText?: string;
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Şartname 5.4 — sırayla:
 * 1) numericGroundingCheck → geçmeyen sayı varsa REJECT
 * 2) bannedPhrases → ilk denemede RETRY, tekrar eşleşirse REVIEW
 * 3) uzunluk / başlık sınırı / boş keyFacts → REVIEW
 * 4) importance >= threshold → REVIEW, aksi halde PUBLISH
 */
export function runEditRules(article: WriteOutput, documentText: string, opts: EditOptions): EditResult {
  const reasons: string[] = [];
  // Şartname 120 kelime ister; ama 150 kelimelik bir duyurudan 120 kelimelik haber ancak dolguyla çıkar.
  // Alt sınır belge uzunluğunun yarısı: en az 60, en çok 120 (canlı testte TCMB rezerv duyurusu 103 kelimede takıldı).
  const minWords = opts.minWords ?? Math.min(120, Math.max(60, Math.round(wordCount(opts.lengthBasisText ?? documentText) / 2)));
  const maxWords = opts.maxWords ?? 350;
  const maxTitle = opts.maxTitleChars ?? 70;

  const articleText = [article.title, article.dek, article.bodyMarkdown, ...article.keyFacts.map((k) => k.text)].join("\n");
  const grounding = numericGroundingCheck(article.numbersUsed, articleText, opts.groundingExtra ? `${documentText}
${opts.groundingExtra}` : documentText);
  const allHits = findBanned({ title: article.title, dek: article.dek, body: article.bodyMarkdown, keyFacts: article.keyFacts.map((k) => k.text).join("\n") });
  const docLower = documentText.toLocaleLowerCase("tr");
  const isAttributed = (b: BannedHit) => b.id in SOURCE_ATTRIBUTABLE && docLower.includes(SOURCE_ATTRIBUTABLE[b.id]!);
  const banned = allHits.filter((b) => !isAttributed(b));
  const sourceAttributed = allHits.filter(isAttributed);

  if (!grounding.ok) {
    reasons.push(`numericGroundingCheck: belgede bulunamayan sayılar: ${grounding.missing.join(", ")}`);
    return { decision: "reject", reasons, grounding, banned, sourceAttributed };
  }

  if (banned.length) {
    reasons.push(`bannedPhrases: ${banned.map((b) => `${b.field}:"${b.match}"(${b.id})`).join(", ")}`);
    return { decision: opts.isRetry ? "review" : "retry", reasons, grounding, banned, sourceAttributed };
  }

  const words = wordCount(article.bodyMarkdown);
  if (words < minWords || words > maxWords) reasons.push(`uzunluk: ${words} kelime (izin: ${minWords}–${maxWords})`);
  if (article.title.length > maxTitle) reasons.push(`başlık: ${article.title.length} karakter (> ${maxTitle})`);
  if (/[!"“”?]/.test(article.title)) reasons.push("başlık: tırnak/ünlem/soru işareti içeriyor");
  if (article.keyFacts.length === 0) reasons.push("keyFacts boş");
  for (const k of article.keyFacts) {
    if (!k.quoteFromSource.trim()) { reasons.push("keyFacts: boş quoteFromSource"); break; }
    if (!quoteAppearsIn(k.quoteFromSource, documentText)) { reasons.push(`keyFacts: alıntı belgede birebir yok: "${k.quoteFromSource.slice(0, 60)}…"`); break; }
  }
  if (reasons.length) return { decision: "review", reasons, grounding, banned, sourceAttributed };

  if (opts.importance >= opts.reviewThreshold) {
    reasons.push(`importance ${opts.importance} >= eşik ${opts.reviewThreshold}: insan onayı`);
    return { decision: "review", reasons, grounding, banned, sourceAttributed };
  }
  return { decision: "publish", reasons, grounding, banned, sourceAttributed };
}

/** Boşluk/tırnak/büyük-küçük farklarını tolere ederek alıntının belgede geçtiğini kontrol eder. */
const ELLIPSIS = /\s*(?:\.{3}|…)\s*/;
export function quoteAppearsIn(quote: string, doc: string): boolean {
  const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[“”"'’‘]/g, "").replace(/\s+/g, " ").trim();
  const d = norm(doc);
  // Kısaltılmış alıntı ("... " ya da "…"): her parça belgede, aynı sırayla geçmeli
  const parts = norm(quote).split(ELLIPSIS).map((p) => p.trim()).filter(Boolean);
  if (parts.join("").length < 8) return true;
  let from = 0;
  for (const p of parts) {
    const at = d.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

export interface FlashCheck { ok: boolean; reasons: string[] }

/**
 * Flaş denetimi (insan onayı olmadan yayımlandığı için katı): belgede olmayan sayı, yasaklı kalıp (yalnızca kurumun kendi
 * tahmini belgede geçiyorsa "tahmin" serbest — tam metindeki istisnanın aynısı), başlık > 90 ya da cümle > 320 karakter → yayımlanmaz. Tam metin her durumda ayrıca yazılır ve kendi kurallarından geçer.
 */
export function checkFlash(f: FlashOutput, documentText: string, opts: { groundingExtra?: string } = {}): FlashCheck {
  const reasons: string[] = [];
  const headline = f.headline.trim();
  const sentence = f.sentence.trim();
  if (!headline || !sentence) reasons.push("flaş: boş başlık ya da cümle");
  if (headline.length > 90) reasons.push(`flaş: başlık ${headline.length} karakter (en fazla 90)`);
  if (sentence.length > 320) reasons.push(`flaş: cümle ${sentence.length} karakter (en fazla 320)`);
  const g = numericGroundingCheck(f.numbersUsed, `${headline}\n${sentence}`, opts.groundingExtra ? `${documentText}\n${opts.groundingExtra}` : documentText);
  if (!g.ok) reasons.push(`flaş: belgede bulunamayan sayılar: ${g.missing.join(", ")}`);
  const docLower = documentText.toLocaleLowerCase("tr");
  const banned = findBanned({ title: headline, dek: sentence }).filter((b) => !(b.id in SOURCE_ATTRIBUTABLE && docLower.includes(SOURCE_ATTRIBUTABLE[b.id]!)));
  if (banned.length) reasons.push(`flaş: yasaklı ifade: ${banned.map((b) => b.match).join(", ")}`);
  return { ok: reasons.length === 0, reasons };
}
