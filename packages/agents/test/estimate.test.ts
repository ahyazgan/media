import { describe, expect, it } from "vitest";
import { costsFromChars, costsFromEvalResults, estimateMarkdown, estimateMonthly, tokensOf } from "../src/eval/estimate.js";
import { dryRunner, loadFixtures, runEval, type EvalRunner } from "../src/eval/index.js";

const prices = { classify: { input: 1, output: 5 }, write: { input: 2, output: 10 } };

describe("maliyet tahmini", () => {
  it("hacim × oran × çağrı maliyeti", () => {
    const est = estimateMonthly([{ sourceId: "kap", perDay: 100, daysPerMonth: 22, newsRate: 0.5 }], { classifyUsd: 0.003, writeUsd: 0.03, basis: "test" });
    expect(est.rows[0]).toMatchObject({ classifyCalls: 2200, writeCalls: 1100 });
    expect(est.totalUsd).toBeCloseTo(2200 * 0.003 + 1100 * 0.03);
  });
  it("karakterden çağrı maliyeti: classify belge başıyla sınırlı, yazım 60 bin karakterle", () => {
    const short = costsFromChars({ classifySystemChars: 2700, writeSystemChars: 2700, docChars: 1000, writeOutputTokens: 1000, retryRate: 0, prices }, "t");
    const long = costsFromChars({ classifySystemChars: 2700, writeSystemChars: 2700, docChars: 500_000, writeOutputTokens: 1000, retryRate: 0, prices }, "t");
    expect(long.classifyUsd).toBeCloseTo(costsFromChars({ classifySystemChars: 2700, writeSystemChars: 2700, docChars: 2000, writeOutputTokens: 1000, retryRate: 0, prices }, "t").classifyUsd);
    expect(long.writeUsd).toBeCloseTo(((tokensOf(2700 + 400 + 60_000)) * 2 + 1000 * 10) / 1e6);
    expect(short.writeUsd).toBeLessThan(long.writeUsd);
  });
  it("eval sonuçlarından ölçülen ortalama", async () => {
    const meta = (model: string) => ({ model, ms: 1, stopReason: "end_turn", usage: { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0 } });
    const priced: EvalRunner = {
      classify: async (i) => ({ ...(await dryRunner.classify(i)), meta: meta("claude-haiku-4-5") }),
      write: async (i) => ({ ...(await dryRunner.write(i)), meta: meta("claude-sonnet-5") }),
    };
    const res = await runEval(loadFixtures({ sources: ["kap"] }), priced);
    const c = costsFromEvalResults(res)!;
    expect(c.classifyUsd).toBeCloseTo((1000 * 1 + 100 * 5) / 1e6);
    expect(c.writeUsd).toBeGreaterThanOrEqual((1000 * 2 + 100 * 10) / 1e6 - 1e-12);
    expect(estimateMarkdown("x", [{ name: "tipik", est: estimateMonthly([{ sourceId: "kap", perDay: 1, daysPerMonth: 1, newsRate: 1 }], c) }])).toContain("ölçüm");
    expect(costsFromEvalResults([])).toBeNull();
  });
});
