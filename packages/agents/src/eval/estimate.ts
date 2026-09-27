/**
 * Aylık model maliyeti tahmini. Hacim (kaynak başına günlük olay) × haber oranı × çağrı başına maliyet.
 * Çağrı maliyetleri varsayılan olarak karakter sayısından türetilmiş tahminlerdir; `pnpm eval:agents` koşulduktan
 * sonra ölçülen değerlerle (fromEvalResults) değiştirilmelidir.
 */
import type { FixtureResult } from "./run.js";

export interface SourceVolume {
  sourceId: string;
  /** İzleme süzgecinden geçen (classify'a giden) günlük olay sayısı */
  perDay: number;
  /** Ayda kaç gün yayın var (Resmi Gazete 30, KAP iş günü ~22) */
  daysPerMonth: number;
  /** classify sonrası haber sayılıp yazılan oran (0–1) */
  newsRate: number;
}

export interface CallCosts {
  classifyUsd: number;
  /** Yeniden yazım dahil, yazılan haber başına */
  writeUsd: number;
  basis: string;
}

export interface MonthlyEstimate {
  rows: { sourceId: string; classifyCalls: number; writeCalls: number; classifyUsd: number; writeUsd: number; totalUsd: number }[];
  totalUsd: number;
  costs: CallCosts;
}

export function estimateMonthly(volumes: SourceVolume[], costs: CallCosts): MonthlyEstimate {
  const rows = volumes.map((v) => {
    const classifyCalls = Math.round(v.perDay * v.daysPerMonth);
    const writeCalls = Math.round(classifyCalls * v.newsRate);
    const classifyUsd = classifyCalls * costs.classifyUsd;
    const writeUsd = writeCalls * costs.writeUsd;
    return { sourceId: v.sourceId, classifyCalls, writeCalls, classifyUsd, writeUsd, totalUsd: classifyUsd + writeUsd };
  });
  return { rows, totalUsd: rows.reduce((a, r) => a + r.totalUsd, 0), costs };
}

/**
 * Karakterden token tahmini. Türkçe metin İngilizceden daha çok token tutar; 2,7 karakter/token varsayımı
 * kaba bir ortalamadır — kesin sayı için API'nin count_tokens ucu ya da eval raporu kullanılmalı.
 */
export const CHARS_PER_TOKEN = 2.7;
export const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

export interface CharCostInput {
  classifySystemChars: number;
  writeSystemChars: number;
  docChars: number;
  /** Yazım çıktısı (JSON gövde + alıntılar); düşünme (thinking) token'ları dahil */
  writeOutputTokens: number;
  classifyOutputTokens?: number;
  retryRate?: number;
  prices: { classify: { input: number; output: number }; write: { input: number; output: number } };
}

export function costsFromChars(c: CharCostInput, basis: string): CallCosts {
  const clsIn = tokensOf(c.classifySystemChars + 200 + Math.min(c.docChars, 2000));
  const clsOut = c.classifyOutputTokens ?? 200;
  const wrIn = tokensOf(c.writeSystemChars + 400 + Math.min(c.docChars, 60_000));
  const classifyUsd = (clsIn * c.prices.classify.input + clsOut * c.prices.classify.output) / 1e6;
  const writeOnce = (wrIn * c.prices.write.input + c.writeOutputTokens * c.prices.write.output) / 1e6;
  return { classifyUsd, writeUsd: writeOnce * (1 + (c.retryRate ?? 0.1)), basis };
}

/** Ölçülmüş çağrı maliyetleri: eval raporundaki gerçek token kullanımından ortalama. */
export function costsFromEvalResults(results: FixtureResult[]): CallCosts | null {
  const cls = results.flatMap((r) => r.calls.filter((c) => c.kind === "classify" && c.costUsd !== null).map((c) => c.costUsd!));
  const written = results.filter((r) => r.wrote);
  const wr = written.map((r) => r.calls.filter((c) => c.kind === "write").reduce((a, c) => a + (c.costUsd ?? 0), 0));
  if (!cls.length || !wr.length) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { classifyUsd: avg(cls), writeUsd: avg(wr), basis: `ölçüm: ${results.length} fixture koşusu (${written.length} yazım)` };
}

export function estimateMarkdown(title: string, scenarios: { name: string; est: MonthlyEstimate }[]): string {
  const usd = (v: number) => `$${v < 10 ? v.toFixed(2) : v.toFixed(0)}`;
  const L = [`### ${title}`, "", "| Senaryo | Kaynak | classify | yazım | Aylık |", "|---|---|---|---|---|"];
  for (const s of scenarios) {
    for (const r of s.est.rows) L.push(`| ${s.name} | ${r.sourceId} | ${r.classifyCalls} çağrı · ${usd(r.classifyUsd)} | ${r.writeCalls} haber · ${usd(r.writeUsd)} | ${usd(r.totalUsd)} |`);
    L.push(`| **${s.name}** | **toplam** | | | **${usd(s.est.totalUsd)}** |`);
  }
  const fine = (v: number) => `$${v.toFixed(4)}`;
  const seen = new Set<string>();
  L.push("", "Çağrı başına maliyet:");
  for (const sc of scenarios) {
    const c = sc.est.costs;
    const line = `- ${sc.name}: classify ${fine(c.classifyUsd)} · yazılan haber ${fine(c.writeUsd)} (${c.basis})`;
    if (!seen.has(c.basis)) { seen.add(c.basis); L.push(line); }
  }
  return L.join("\n");
}
