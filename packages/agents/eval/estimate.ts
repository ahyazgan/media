/**
 * Aylık model maliyeti tahmini.
 *   pnpm cost:estimate                              # varsayılan senaryolar (karakterden tahmin)
 *   pnpm cost:estimate -- --from-eval latest        # son canlı eval raporunun ölçülen çağrı maliyetleriyle
 *   pnpm cost:estimate -- --rg 18 --kap 320 --news-rg 0.35 --news-kap 0.45   # gerçek hacimle tek senaryo
 * Hacim ölçümü (canlıda, son 30 gün): docs/MALIYET.md'deki SQL sorgusu.
 */
import { readdirSync, readFileSync } from "node:fs";
import { models } from "../src/client.js";
import { CLASSIFY_SYSTEM, WRITE_SYSTEM } from "../src/prompts.js";
import { costsFromChars, costsFromEvalResults, estimateMarkdown, estimateMonthly, type CallCosts, type SourceVolume } from "../src/eval/estimate.js";
import { priceFor } from "../src/eval/pricing.js";
import type { FixtureResult } from "../src/eval/run.js";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const num = (n: string) => (opt(n) === undefined ? undefined : Number(opt(n)));

const m = models();
const pc = priceFor(m.classify), pw = priceFor(m.write);
if (!pc || !pw) { console.error(`Fiyat tablosunda olmayan model: ${!pc ? m.classify : m.write} (src/eval/pricing.ts)`); process.exit(2); }
const prices = { classify: pc, write: pw };

function measured(): CallCosts | null {
  const src = opt("from-eval");
  if (!src) return null;
  const dir = new URL("../eval-results/", import.meta.url);
  const file = src === "latest"
    ? readdirSync(dir).filter((f) => f.endsWith("-live.json")).sort().pop()
    : src;
  if (!file) { console.error("Canlı eval raporu yok: önce `pnpm eval:agents` koşun."); process.exit(2); }
  const json = JSON.parse(readFileSync(src === "latest" ? new URL(file, dir) : file, "utf8")) as { results: FixtureResult[] };
  return costsFromEvalResults(json.results);
}

const base = { classifySystemChars: CLASSIFY_SYSTEM.length, writeSystemChars: WRITE_SYSTEM.length, prices };
const m0 = measured();
const costSets: Record<string, CallCosts> = m0
  ? { düşük: m0, tipik: m0, yüksek: m0 }
  : {
      düşük: costsFromChars({ ...base, docChars: 2_000, writeOutputTokens: 1_200 }, "tahmin: kısa belge, az düşünme"),
      tipik: costsFromChars({ ...base, docChars: 4_000, writeOutputTokens: 2_000 }, "tahmin: 4 bin karakter belge, çıktı+düşünme 2 bin token"),
      yüksek: costsFromChars({ ...base, docChars: 20_000, writeOutputTokens: 3_500 }, "tahmin: uzun mevzuat, yoğun düşünme"),
    };

const V = (sourceId: string, perDay: number, daysPerMonth: number, newsRate: number): SourceVolume => ({ sourceId, perDay, daysPerMonth, newsRate });
const custom = num("rg") !== undefined || num("kap") !== undefined;
const scen: Record<string, SourceVolume[]> = custom
  ? { ölçülen: [V("resmi-gazete", num("rg") ?? 0, 30, num("news-rg") ?? 0.4), V("kap", num("kap") ?? 0, 22, num("news-kap") ?? 0.5), V("tcmb+tuik", num("tcmb") ?? 3, 22, 0.8)] }
  : {
      düşük: [V("resmi-gazete", 8, 30, 0.4), V("kap", 150, 22, 0.5), V("tcmb+tuik", 2, 22, 0.8)],
      tipik: [V("resmi-gazete", 15, 30, 0.4), V("kap", 300, 22, 0.5), V("tcmb+tuik", 3, 22, 0.8)],
      yüksek: [V("resmi-gazete", 25, 30, 0.4), V("kap", 600, 22, 0.5), V("tcmb+tuik", 5, 22, 0.8)],
    };

const pick = (name: string) => costSets[name] ?? costSets["tipik"]!;
const rgOnly = Object.entries(scen).map(([name, vols]) => ({ name, est: estimateMonthly(vols.filter((v) => v.sourceId === "resmi-gazete"), pick(name)) }));
const all = Object.entries(scen).map(([name, vols]) => ({ name, est: estimateMonthly(vols, pick(name)) }));
console.log(`Modeller: classify=${m.classify} ($${pc.input}/$${pc.output} MTok) · write=${m.write} ($${pw.input}/$${pw.output} MTok)\n`);
console.log(estimateMarkdown("Açılış: yalnızca Resmi Gazete", rgOnly));
console.log("");
console.log(estimateMarkdown("Resmi Gazete + KAP + TCMB/TÜİK", all));
