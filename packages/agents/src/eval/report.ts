import type { FixtureResult } from "./run.js";

export interface EvalSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  errors: number;
  classify: { category: [number, number]; importance: [number, number]; isNews: [number, number] };
  decisions: Record<string, number>;
  retries: number;
  written: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd: number | null;
  costPerWrittenUsd: number | null;
  latencyMs: { classifyP50: number; classifyP95: number; writeP50: number; writeP95: number };
  models: string[];
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};
const ratio = (vals: (boolean | null)[]): [number, number] => {
  const known = vals.filter((v): v is boolean => v !== null);
  return [known.filter(Boolean).length, known.length];
};

export function summarize(results: FixtureResult[]): EvalSummary {
  const calls = results.flatMap((r) => r.calls);
  const tokens = calls.reduce((t, c) => ({ input: t.input + c.usage.input, output: t.output + c.usage.output, cacheRead: t.cacheRead + c.usage.cacheRead, cacheWrite: t.cacheWrite + c.usage.cacheWrite }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  const costKnown = !calls.some((c) => c.costUsd === null);
  const costUsd = costKnown ? calls.reduce((a, c) => a + (c.costUsd ?? 0), 0) : null;
  const written = results.filter((r) => r.wrote).length;
  const decisions: Record<string, number> = {};
  for (const r of results) if (r.decision) decisions[r.decision] = (decisions[r.decision] ?? 0) + 1;
  const ms = (k: "classify" | "write") => calls.filter((c) => c.kind === k).map((c) => c.ms);
  return {
    total: results.length,
    pass: results.filter((r) => r.verdict === "pass").length,
    warn: results.filter((r) => r.verdict === "warn").length,
    fail: results.filter((r) => r.verdict === "fail").length,
    errors: results.filter((r) => r.error).length,
    classify: { category: ratio(results.map((r) => r.checks.category)), importance: ratio(results.map((r) => r.checks.importance)), isNews: ratio(results.map((r) => r.checks.isNews)) },
    decisions,
    retries: results.filter((r) => r.attempts > 1).length,
    written,
    tokens,
    costUsd,
    costPerWrittenUsd: costUsd !== null && written ? costUsd / written : null,
    latencyMs: { classifyP50: pct(ms("classify"), 50), classifyP95: pct(ms("classify"), 95), writeP50: pct(ms("write"), 50), writeP95: pct(ms("write"), 95) },
    models: [...new Set(calls.map((c) => c.model))],
  };
}

const usd = (v: number | null) => (v === null ? "bilinmiyor" : `$${v.toFixed(v < 0.01 ? 4 : 3)}`);
const frac = ([a, b]: [number, number]) => (b ? `${a}/${b}` : "—");
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
const mark = { pass: "✅", warn: "⚠️", fail: "❌" } as const;

export function toMarkdown(results: FixtureResult[], meta: { mode: string; startedAt: string; note?: string }): string {
  const s = summarize(results);
  const L: string[] = [];
  L.push(`# Ajan değerlendirmesi — ${meta.startedAt}`, "");
  L.push(`Mod: **${meta.mode}** · Modeller: ${s.models.join(", ") || "—"}`);
  if (meta.note) L.push("", `> ${meta.note}`);
  L.push("", "## Özet", "", "| Ölçüt | Değer |", "|---|---|");
  L.push(`| Sonuç | ${s.pass} geçti · ${s.warn} uyarı · ${s.fail} kaldı (toplam ${s.total}) |`);
  L.push(`| Sınıflandırma | kategori ${frac(s.classify.category)} · önem ${frac(s.classify.importance)} · isNews ${frac(s.classify.isNews)} |`);
  L.push(`| Kural motoru | ${Object.entries(s.decisions).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"} · yeniden yazım ${s.retries} |`);
  L.push(`| Maliyet | toplam ${usd(s.costUsd)} · yazılan haber başına ${usd(s.costPerWrittenUsd)} |`);
  L.push(`| Token | giriş ${s.tokens.input} · çıkış ${s.tokens.output} · önbellek okuma ${s.tokens.cacheRead} · yazma ${s.tokens.cacheWrite} |`);
  L.push(`| Gecikme (p50 / p95) | classify ${s.latencyMs.classifyP50} / ${s.latencyMs.classifyP95} ms · write ${s.latencyMs.writeP50} / ${s.latencyMs.writeP95} ms |`);
  L.push("", "## Fixture'lar", "", "| | Fixture | Kategori | Önem | Haber mi | Karar | Kelime | Başlık | Maliyet |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const c = r.classify;
    const flag = (ok: boolean | null, v: unknown) => (v === undefined ? "—" : ok === false ? `**${v}**` : String(v));
    L.push(`| ${mark[r.verdict]} | ${r.id}${r.run > 1 ? ` #${r.run}` : ""}${r.synthetic ? " (sentetik)" : ""} | ${flag(r.checks.category, c?.category)} | ${flag(r.checks.importance, c?.importance)} | ${flag(r.checks.isNews, c?.isNews)} | ${r.decision ?? (r.wrote ? "—" : "yazılmadı")} | ${r.words ?? "—"} | ${r.titleLength ?? "—"} | ${usd(r.costUsd)} |`);
  }
  const bad = results.filter((r) => r.verdict !== "pass");
  if (bad.length) {
    L.push("", "## Ayrıntı (uyarı ve hatalar)");
    for (const r of bad) {
      L.push("", `### ${mark[r.verdict]} ${r.id}${r.run > 1 ? ` #${r.run}` : ""}`);
      for (const f of r.failReasons) L.push(`- ${cell(f)}`);
      for (const x of r.reasons) if (!r.failReasons.some((f) => f.includes(x))) L.push(`- kural: ${cell(x)}`);
      if (r.attempts > 1) L.push(`- yasaklı kalıp yüzünden yeniden yazıldı (ilk denemede: ${r.bannedHits.join(", ") || "?"})`);
      if (r.article) L.push("", `**${cell(r.article.title)}**`, "", `_${cell(r.article.dek)}_`);
    }
  }
  L.push("", "---", "Fiyatlar `packages/agents/src/eval/pricing.ts` tablosundan hesaplanır; güncelliğini docs.claude.com'dan kontrol edin.");
  return L.join("\n") + "\n";
}

export function consoleLine(r: FixtureResult): string {
  const c = r.classify;
  const cls = c ? `${c.category}/${c.importance}/${c.isNews ? "haber" : "değil"}` : "—";
  const extra = r.failReasons[0] ?? (r.verdict === "warn" ? r.reasons[0] ?? "yeniden yazım" : "");
  return `${mark[r.verdict]} ${r.id.padEnd(34)} ${cls.padEnd(22)} ${(r.decision ?? "-").padEnd(8)} ${extra}`.trimEnd();
}
