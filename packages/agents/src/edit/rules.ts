import { findBanned, type BannedHit } from "./banned.js";
import { numericGroundingCheck, type GroundingResult } from "./numericGrounding.js";
import type { WriteOutput } from "../schemas.js";

export type EditDecision = "publish" | "review" | "reject" | "retry";

export interface EditResult {
  decision: EditDecision;
  reasons: string[];
  grounding: GroundingResult;
  banned: BannedHit[];
}

export interface EditOptions {
  importance: number;
  reviewThreshold: number;
  /** Bu, yasaklı kalıp yüzünden yapılan ikinci deneme mi? */
  isRetry?: boolean;
  minWords?: number;
  maxWords?: number;
  maxTitleChars?: number;
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
  const minWords = opts.minWords ?? 120;
  const maxWords = opts.maxWords ?? 350;
  const maxTitle = opts.maxTitleChars ?? 70;

  const articleText = [article.title, article.dek, article.bodyMarkdown, ...article.keyFacts.map((k) => k.text)].join("\n");
  const grounding = numericGroundingCheck(article.numbersUsed, articleText, documentText);
  const banned = findBanned({ title: article.title, dek: article.dek, body: article.bodyMarkdown, keyFacts: article.keyFacts.map((k) => k.text).join("\n") });

  if (!grounding.ok) {
    reasons.push(`numericGroundingCheck: belgede bulunamayan sayılar: ${grounding.missing.join(", ")}`);
    return { decision: "reject", reasons, grounding, banned };
  }

  if (banned.length) {
    reasons.push(`bannedPhrases: ${banned.map((b) => `${b.field}:"${b.match}"(${b.id})`).join(", ")}`);
    return { decision: opts.isRetry ? "review" : "retry", reasons, grounding, banned };
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
  if (reasons.length) return { decision: "review", reasons, grounding, banned };

  if (opts.importance >= opts.reviewThreshold) {
    reasons.push(`importance ${opts.importance} >= eşik ${opts.reviewThreshold}: insan onayı`);
    return { decision: "review", reasons, grounding, banned };
  }
  return { decision: "publish", reasons, grounding, banned };
}

/** Boşluk/tırnak/büyük-küçük farklarını tolere ederek alıntının belgede geçtiğini kontrol eder. */
export function quoteAppearsIn(quote: string, doc: string): boolean {
  const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[“”"'’‘]/g, "").replace(/\s+/g, " ").trim();
  const q = norm(quote);
  if (q.length < 8) return true;
  return norm(doc).includes(q);
}
