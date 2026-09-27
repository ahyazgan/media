import type { ClassifyInput, ClassifyOutput, WriteInput, WriteOutput } from "../schemas.js";
import type { CallMeta, Detailed } from "../meta.js";
import { runEditRules, wordCount, type EditDecision } from "../edit/rules.js";
import type { Fixture } from "./fixtures.js";
import { costOf } from "./pricing.js";

export interface EvalRunner {
  classify(input: ClassifyInput): Promise<Detailed<ClassifyOutput>>;
  write(input: WriteInput): Promise<Detailed<WriteOutput>>;
}

export type Verdict = "pass" | "warn" | "fail";
export type CallRecord = CallMeta & { kind: "classify" | "write"; costUsd: number | null };

export interface FixtureResult {
  id: string;
  source: string;
  run: number;
  synthetic: boolean;
  classify?: ClassifyOutput;
  checks: { category: boolean | null; importance: boolean | null; isNews: boolean | null };
  wrote: boolean;
  attempts: number;
  article?: WriteOutput;
  decision?: EditDecision;
  reasons: string[];
  missingNumbers: string[];
  bannedHits: string[];
  mustNotContainHits: string[];
  words?: number;
  titleLength?: number;
  calls: CallRecord[];
  costUsd: number | null;
  error?: string;
  verdict: Verdict;
  failReasons: string[];
}

export interface EvalOptions {
  /** isNews=false çıksa bile haberi yaz (prompt ayarı için) */
  writeAll?: boolean;
  repeat?: number;
  concurrency?: number;
  onResult?: (r: FixtureResult) => void;
}

function record(kind: CallRecord["kind"], meta: CallMeta): CallRecord {
  return { ...meta, kind, costUsd: costOf(meta.model, meta.usage) };
}

/** Tek fixture: classify → (haberse) write → kural motoru; yasaklı kalıpta pipeline gibi bir kez yeniden yazar. */
export async function evaluateFixture(fx: Fixture, runner: EvalRunner, run = 1, opts: EvalOptions = {}): Promise<FixtureResult> {
  const r: FixtureResult = {
    id: fx.id, source: fx.source, run, synthetic: Boolean(fx.event.synthetic),
    checks: { category: null, importance: null, isNews: null }, wrote: false, attempts: 0,
    reasons: [], missingNumbers: [], bannedHits: [], mustNotContainHits: [], calls: [], costUsd: null,
    verdict: "pass", failReasons: [],
  };
  const exp = fx.expected.classify;
  try {
    const section = typeof fx.event.payload?.["section"] === "string" ? (fx.event.payload["section"] as string) : undefined;
    const c = await runner.classify({ sourceId: fx.event.sourceId, title: fx.event.title, textHead: fx.doc.slice(0, 2000), section });
    r.calls.push(record("classify", c.meta));
    r.classify = c.output;
    r.checks.category = exp.category.includes(c.output.category);
    r.checks.importance = (exp.importanceMin === undefined || c.output.importance >= exp.importanceMin) && (exp.importanceMax === undefined || c.output.importance <= exp.importanceMax);
    r.checks.isNews = exp.isNews === null ? null : c.output.isNews === exp.isNews;

    if (c.output.isNews || opts.writeAll) {
      const input: WriteInput = {
        sourceId: fx.event.sourceId, sourceName: fx.event.sourceName, sourceUrl: fx.event.url, title: fx.event.title,
        documentText: fx.doc, publishedAt: fx.event.publishedAt, classify: c.output,
      };
      // Eşik 99: değerlendirmede önem kapısı değil, yalnızca kalite kuralları ölçülür.
      let w = await runner.write(input);
      r.calls.push(record("write", w.meta));
      r.attempts = 1;
      let edit = runEditRules(w.output, fx.doc, { importance: c.output.importance, reviewThreshold: 99 });
      if (edit.decision === "retry") {
        w = await runner.write({ ...input, avoidPhrases: edit.banned.map((b) => b.match) });
        r.calls.push(record("write", w.meta));
        r.attempts = 2;
        edit = runEditRules(w.output, fx.doc, { importance: c.output.importance, reviewThreshold: 99, isRetry: true });
      }
      r.wrote = true;
      r.article = w.output;
      r.decision = edit.decision;
      r.reasons = edit.reasons;
      r.missingNumbers = edit.grounding.missing;
      r.bannedHits = edit.banned.map((b) => `${b.field}:${b.match}`);
      r.words = wordCount(w.output.bodyMarkdown);
      r.titleLength = w.output.title.length;
      const text = `${w.output.title}\n${w.output.dek}\n${w.output.bodyMarkdown}`.toLocaleLowerCase("tr");
      r.mustNotContainHits = fx.expected.mustNotContain.filter((p) => text.includes(p.toLocaleLowerCase("tr")));
    }
  } catch (e) {
    r.error = (e as Error).message;
    const meta = (e as { meta?: CallMeta }).meta;
    if (meta) r.calls.push(record(r.calls.length ? "write" : "classify", meta));
  }
  const costs = r.calls.map((c) => c.costUsd);
  r.costUsd = costs.some((x) => x === null) ? null : costs.reduce<number>((a, b) => a + (b ?? 0), 0);
  grade(r);
  opts.onResult?.(r);
  return r;
}

function grade(r: FixtureResult) {
  const fail = r.failReasons;
  if (r.error) fail.push(`hata: ${r.error}`);
  if (r.checks.category === false) fail.push(`kategori beklenmiyor: ${r.classify?.category}`);
  if (r.checks.importance === false) fail.push(`önem aralık dışı: ${r.classify?.importance}`);
  if (r.checks.isNews === false) fail.push(`isNews beklenmiyor: ${r.classify?.isNews}`);
  if (r.decision === "reject") fail.push(`kural motoru reddetti: ${r.reasons.join("; ")}`);
  if (r.mustNotContainHits.length) fail.push(`yasak ifade: ${r.mustNotContainHits.join(", ")}`);
  if (fail.length) { r.verdict = "fail"; return; }
  // review = kalite kuralı (uzunluk, başlık, alıntı) takıldı ya da yasaklı kalıp tekrarında düzelmedi
  r.verdict = r.decision === "review" || r.attempts > 1 ? "warn" : "pass";
}

/** Tüm fixture'ları sınırlı eş zamanlılıkla koşar; sonuç sırası fixture sırasıdır. */
export async function runEval(fixtures: Fixture[], runner: EvalRunner, opts: EvalOptions = {}): Promise<FixtureResult[]> {
  const jobs: { fx: Fixture; run: number }[] = [];
  for (let run = 1; run <= (opts.repeat ?? 1); run++) for (const fx of fixtures) jobs.push({ fx, run });
  const results: FixtureResult[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      const j = jobs[i]!;
      results[i] = await evaluateFixture(j.fx, runner, j.run, opts);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 3, jobs.length)) }, worker));
  return results;
}
