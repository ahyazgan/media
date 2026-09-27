/**
 * Ajan değerlendirmesi: altın örnekleri gerçek modelden (ya da --dry ile sahte koşucudan) geçirir,
 * sınıflandırmayı beklentiyle karşılaştırır, haberi kural motorundan geçirir, maliyet ve gecikmeyi raporlar.
 *
 *   pnpm eval:agents                         # tüm kaynaklar, gerçek model (ANTHROPIC_API_KEY gerekir)
 *   pnpm eval:agents -- --dry                # anahtarsız: düzeneğin kendisini sınar
 *   pnpm eval:agents -- --source kap --only 03 --repeat 3
 *   pnpm eval:agents -- --write-all          # isNews=false çıksa da yaz (prompt ayarı için)
 *   MODEL_WRITE=claude-opus-5 pnpm eval:agents   # başka modelle karşılaştır
 *
 * Çıktı: packages/agents/eval-results/<zaman>-<mod>.{md,json}. Kalan (❌) varsa çıkış kodu 1 (--no-fail ile 0).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hasApiKey, models } from "../src/client.js";
import { classifyDetailed } from "../src/classify.js";
import { writeDetailed } from "../src/write.js";
import { consoleLine, dryRunner, loadFixtures, runEval, summarize, toMarkdown, type EvalRunner } from "../src/eval/index.js";

// Kök .env (API anahtarı, MODEL_*). Ortamda zaten olan değerler ezilmez.
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (m && m[2] !== "" && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const argv = process.argv.slice(2).filter((a) => a !== "--");
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const dry = flag("dry");
if (!dry && !hasApiKey()) {
  console.error("ANTHROPIC_API_KEY yok. Kök .env dosyasına ekleyin ya da düzeneği denemek için: pnpm eval:agents -- --dry");
  process.exit(2);
}

const fixtures = loadFixtures({ sources: opt("source")?.split(","), only: opt("only") });
if (!fixtures.length) { console.error("Süzgece uyan fixture yok."); process.exit(2); }
const runner: EvalRunner = dry ? dryRunner : { classify: classifyDetailed, write: writeDetailed };
const repeat = Math.max(1, Number(opt("repeat") ?? 1));
const startedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const mode = dry ? "dry (sahte koşucu)" : `canlı · classify=${models().classify} · write=${models().write}`;

console.log(`[eval] ${fixtures.length} fixture × ${repeat} tekrar · ${mode}`);
const results = await runEval(fixtures, runner, {
  repeat, concurrency: Number(opt("concurrency") ?? 3), writeAll: flag("write-all"),
  onResult: (r) => console.log(consoleLine(r)),
});

const s = summarize(results);
const outDir = new URL("../eval-results/", import.meta.url);
mkdirSync(outDir, { recursive: true });
const stamp = startedAt.replace(/[:]/g, "").replace("T", "-").replace("Z", "");
const base = `${stamp}-${dry ? "dry" : "live"}`;
const note = dry ? "Sahte koşucu: yalnızca düzeneği sınar; sınıflandırma ve haber kalitesi anlamlı değildir." : undefined;
writeFileSync(new URL(`${base}.md`, outDir), toMarkdown(results, { mode, startedAt, note }));
writeFileSync(new URL(`${base}.json`, outDir), JSON.stringify({ startedAt, mode, summary: s, results }, null, 2));

const usd = s.costUsd === null ? "bilinmiyor" : `$${s.costUsd.toFixed(4)}`;
console.log(`\n[eval] ${s.pass} geçti · ${s.warn} uyarı · ${s.fail} kaldı · maliyet ${usd}`);
console.log(`[eval] rapor: packages/agents/eval-results/${base}.md`);
process.exit(s.fail > 0 && !flag("no-fail") ? 1 : 0);
