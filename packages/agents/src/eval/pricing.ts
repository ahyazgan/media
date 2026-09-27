import type { CallUsage } from "../meta.js";

/**
 * USD / milyon token (giriş, çıkış). Anthropic birinci taraf API fiyatları; kod içi tablo, güncelliğini
 * docs.claude.com fiyat sayfasından kontrol edin. Önbellek yazma = giriş × 1,25; önbellek okuma = giriş × 0,1.
 * Önek eşleşmesi: daha uzun önek önce gelmeli (claude-opus-5-5, claude-opus-5'ten önce).
 */
const PRICES: [prefix: string, input: number, output: number][] = [
  ["claude-haiku-4-5", 1, 5],
  ["claude-sonnet-5", 2, 10],
  ["claude-sonnet-4-6", 3, 15],
  ["claude-opus-5-5", 4, 20],
  ["claude-opus-5", 5, 25],
  ["claude-opus-4", 5, 25],
  ["claude-fable-5", 10, 50],
  ["claude-mythos-5", 10, 50],
];

export function priceFor(model: string): { input: number; output: number } | null {
  const hit = PRICES.find(([p]) => model.startsWith(p));
  return hit ? { input: hit[1], output: hit[2] } : null;
}

/** Çağrının USD maliyeti; model tabloda yoksa null (raporda "bilinmiyor"). */
export function costOf(model: string, u: CallUsage): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (u.input * p.input + u.output * p.output + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.input * 0.1) / 1e6;
}
