import { describe, expect, it } from "vitest";
import { costOf, dryRunner, loadFixtures, runEval, summarize, toMarkdown, consoleLine, evaluateFixture, type EvalRunner } from "../src/eval/index.js";

const usage = { input: 2000, output: 800, cacheRead: 0, cacheWrite: 0 };
const meta = (model: string) => ({ model, ms: 120, stopReason: "end_turn", usage });
/** dryRunner'ı "canlı gibi" gösterir: tabloda fiyatı olan model adları ve token kullanımı */
const priced: EvalRunner = {
  classify: async (i) => ({ ...(await dryRunner.classify(i)), meta: meta("claude-haiku-4-5") }),
  write: async (i) => ({ ...(await dryRunner.write(i)), meta: meta("claude-sonnet-5") }),
};

describe("fiyat", () => {
  it("model önekine göre hesaplar", () => {
    expect(costOf("claude-haiku-4-5", { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(1);
    expect(costOf("claude-sonnet-5", { input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(0.012);
    expect(costOf("claude-sonnet-5", { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 })).toBeCloseTo(0.2 + 2.5);
    expect(costOf("claude-opus-5-5", { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(4); // opus-5'ten önce eşleşir
    expect(costOf("dry", usage)).toBeNull();
  });
});

describe("fixture yükleme", () => {
  const all = loadFixtures();
  it("tüm kaynakları yükler, bozuk örneği almaz", () => {
    expect(all.length).toBeGreaterThanOrEqual(20);
    expect(new Set(all.map((f) => f.source))).toEqual(new Set(["kap", "resmi-gazete", "tcmb", "tuik"]));
    expect(all.some((f) => f.id.includes("99-"))).toBe(false);
  });
  it("kaynak ve ad süzgeci", () => {
    expect(loadFixtures({ sources: ["kap"] }).every((f) => f.source === "kap")).toBe(true);
    expect(loadFixtures({ only: "02-tuketici" }).map((f) => f.id)).toEqual(["resmi-gazete/02-tuketici-uzlasma"]);
  });
});

describe("runEval", () => {
  const fixtures = loadFixtures();
  it("sahte koşucuyla tüm fixture'ları hatasız koşar ve raporlar", async () => {
    const results = await runEval(fixtures, dryRunner, { concurrency: 4 });
    expect(results).toHaveLength(fixtures.length);
    expect(results.map((r) => r.id)).toEqual(fixtures.map((f) => f.id)); // sıra korunur
    expect(results.filter((r) => r.error)).toEqual([]);
    const s = summarize(results);
    expect(s.total).toBe(fixtures.length);
    expect(s.pass + s.warn + s.fail).toBe(s.total);
    expect(s.costUsd).toBeNull(); // "dry" modelinin fiyatı yok
    const md = toMarkdown(results, { mode: "dry", startedAt: "2026-09-27T00:00:00Z" });
    expect(md).toContain("## Özet");
    for (const f of fixtures) expect(md).toContain(f.id);
  });

  it("maliyeti ve gecikmeyi toplar; repeat çarpar", async () => {
    const fx = loadFixtures({ only: "02-tuketici" });
    const results = await runEval(fx, priced, { repeat: 2 });
    expect(results.map((r) => r.run)).toEqual([1, 2]);
    const s = summarize(results);
    const perRun = (2000 * 1 + 800 * 5) / 1e6 + (2000 * 2 + 800 * 10) / 1e6;
    expect(s.costUsd).toBeCloseTo(perRun * 2, 6);
    expect(s.latencyMs.writeP50).toBe(120);
    expect(s.models.sort()).toEqual(["claude-haiku-4-5", "claude-sonnet-5"]);
  });

  it("uydurma sayı → kaldı (kural motoru reddi)", async () => {
    const liar: EvalRunner = { ...priced, write: async (i) => { const w = await priced.write(i); return { ...w, output: { ...w.output, dek: "Ceza 9.876.543 TL oldu." } }; } };
    const [r] = await runEval(loadFixtures({ only: "02-tuketici" }), liar);
    expect(r?.verdict).toBe("fail");
    expect(r?.decision).toBe("reject");
    expect(r?.missingNumbers).toContain("9.876.543");
    expect(consoleLine(r!)).toMatch(/^❌/);
  });

  it("yasaklı kalıp → bir kez yeniden yazar, düzelirse uyarı", async () => {
    let n = 0;
    const flaky: EvalRunner = { ...priced, write: async (i) => { const w = await priced.write(i); n++; return n === 1 ? { ...w, output: { ...w.output, dek: "Düzenlemenin etkisi büyük olabilir." } } : w; } };
    const [fx] = loadFixtures({ only: "02-tuketici" });
    const r = await evaluateFixture(fx!, flaky);
    expect(r.attempts).toBe(2);
    expect(r.bannedHits).toEqual([]); // ikinci deneme temiz
    expect(r.calls.filter((c) => c.kind === "write")).toHaveLength(2);
    expect(r.verdict).not.toBe("fail");
  });

  it("sınıflandırma sapması ve çağrı hatası kaldırır ama koşuyu durdurmaz", async () => {
    const wrongCat: EvalRunner = { ...priced, classify: async (i) => { const c = await priced.classify(i); return { ...c, output: { ...c.output, category: "enerji" } }; } };
    const [a] = await runEval(loadFixtures({ only: "02-tuketici" }), wrongCat);
    expect(a?.verdict).toBe("fail");
    expect(a?.failReasons.join()).toMatch(/kategori/);
    const broken: EvalRunner = { ...priced, write: async () => { throw new Error("529 overloaded"); } };
    const res = await runEval(loadFixtures({ sources: ["kap"] }), broken);
    expect(res.every((r) => r.verdict === "fail" && r.error?.includes("529"))).toBe(true);
  });
});
