import { quoteAppearsIn } from "./rules.js";
import { numericGroundingCheck } from "./numericGrounding.js";
import type { VerifyIssue } from "../schemas.js";

export interface SemanticResult {
  ok: boolean;
  /** Süzgeçten geçen (yayını durduran) bulgular */
  issues: VerifyIssue[];
  /** Denetçinin uydurduğu düşünülen bulgular: iddia haberde ya da kanıt belgede (birebir ya da gevşek eşleşmeyle) yok */
  dropped: VerifyIssue[];
  reasons: string[];
}

/**
 * Anlam denetçisinin bulgularını süzer: yanlış alarm doğru haberi (özellikle flaşı) durdurmasın diye bir bulgu ancak
 *  - iddia haberde birebir geçiyorsa ve
 *  - kanıt belgede (ya da arka planda) birebir geçiyorsa sayılır. "desteksiz" bulguda kanıt olmayabilir (olmayanı alıntılayamaz).
 */
export function acceptIssues(issues: VerifyIssue[], articleText: string, documentText: string, contextText?: string): SemanticResult {
  const basis = contextText ? `${documentText}\n${contextText}` : documentText;
  const kept: VerifyIssue[] = [];
  const dropped: VerifyIssue[] = [];
  for (const i of issues) {
    const claimOk = i.claim.trim().length > 0 && (quoteAppearsIn(i.claim, articleText) || looselyQuoted(i.claim, articleText));
    const evidenceOk = i.problem === "desteksiz" || (i.evidence.trim().length > 0 && (quoteAppearsIn(i.evidence, basis) || looselyQuoted(i.evidence, basis)));
    // Denetçi bazen bulguyu bildirip açıklamada geri alıyor ("…eş anlamlı olduğu için sorun yoktur"): prompt bunu yasaklıyor, burada da düşer
    const selfRetracted = /sorun\s+(?:yok|değil)|eş\s+anlamlı|doğru\s+(?:yönde|aktarılmış|verilmiş)|dilbilgisi|olgu\s+hatası\s+değil/iu.test(i.explanation);
    (claimOk && evidenceOk && !selfRetracted ? kept : dropped).push(i);
  }
  return {
    ok: kept.length === 0, issues: kept, dropped,
    reasons: kept.map((i) => `anlam/${i.problem}: "${i.claim.trim().slice(0, 90)}" — ${i.explanation.trim()}`),
  };
}

const words = (s: string) => s.toLocaleLowerCase("tr").replace(/[“”"'’‘()]/g, " ").split(/[^\p{L}\p{N},.%]+/u)
  .map((w) => w.replace(/^[,.]+|[,.]+$/g, "")).filter(Boolean);

/**
 * Denetçi uzun cümleden alıntılarken araya giren yan cümleyi işaretsiz atlayabiliyor ("…yüzde 2,1, [Aralık'a göre yüzde 21,6,] bir önceki
 * yılın aynı ayına göre yüzde 28,4"); birebir eşleşme bu yüzden GERÇEK hatayı düşürüyordu. Gevşek eşleşme: kanıttaki her sayı belgede
 * geçmeli ve kanıtın ardışık üçlü kelime gruplarının en az %75'i belgede bulunmalı. Uydurma kanıt ("Kurul faizi artırmıştır") ikisini
 * birden sağlayamaz. 5 kelimeden kısa kanıt yalnızca birebir eşleşmeyle kabul edilir.
 */
export function looselyQuoted(evidence: string, doc: string): boolean {
  const ev = words(evidence);
  if (ev.length < 5) return false;
  if (!numericGroundingCheck([], evidence, doc).ok) return false;
  const docTri = new Set<string>();
  const dw = words(doc);
  for (let k = 0; k + 2 < dw.length; k++) docTri.add(`${dw[k]} ${dw[k + 1]} ${dw[k + 2]}`);
  let hit = 0, total = 0;
  for (let k = 0; k + 2 < ev.length; k++, total++) if (docTri.has(`${ev[k]} ${ev[k + 1]} ${ev[k + 2]}`)) hit++;
  return total > 0 && hit / total >= 0.75;
}
