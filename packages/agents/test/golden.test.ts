import { readdirSync, readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runEditRules } from "../src/edit/rules.js";
import { extractNumbers, numericGroundingCheck } from "../src/edit/numericGrounding.js";
import { WriteOutput } from "../src/schemas.js";
import { hasApiKey } from "../src/client.js";

const ROOT = new URL("../fixtures/resmi-gazete/", import.meta.url);
type Expected = {
  classify: { category: string[]; importanceMin?: number; importanceMax?: number; isNews: boolean | null };
  mustGround: string[]; mustNotContain: string[];
};
const dirs = readdirSync(ROOT).filter((d) => /^\d\d-/.test(d) && !d.startsWith("99"));
const load = (d: string) => ({
  doc: readFileSync(new URL(`${d}/document.txt`, ROOT), "utf8"),
  event: JSON.parse(readFileSync(new URL(`${d}/event.json`, ROOT), "utf8")) as { title: string; url: string; sourceName: string; publishedAt: string; sourceId: string },
  expected: JSON.parse(readFileSync(new URL(`${d}/expected.json`, ROOT), "utf8")) as Expected,
});

describe("altın örnekler — bütünlük (çevrimdışı)", () => {
  it("en az 5 gerçek belge var", () => expect(dirs.length).toBeGreaterThanOrEqual(5));
  it.each(dirs)("%s: mustGround sayıları belgede gerçekten var", (d) => {
    const { doc, expected } = load(d);
    const r = numericGroundingCheck(expected.mustGround, "", doc);
    expect(r.missing).toEqual([]);
    expect(extractNumbers(doc).length).toBeGreaterThan(0);
  });
});

describe("altın örnekler — bilerek bozulmuş fixture reddedilir (Faz 1 kabul)", () => {
  const broken = JSON.parse(readFileSync(new URL("99-broken-numbers/article.json", ROOT), "utf8")) as { fixture: string; article: unknown };
  const article = WriteOutput.parse(broken.article);
  const { doc } = load(broken.fixture);
  it("numericGroundingCheck → reject", () => {
    const r = runEditRules(article, doc, { importance: 3, reviewThreshold: 4 });
    expect(r.decision).toBe("reject");
    expect(r.grounding.missing).toEqual(expect.arrayContaining(["15 Kasım 2025", "2,5 milyon"]));
    // 6502 ve 30436 belgede var, eksik listesinde olmamalı
    expect(r.grounding.missing).not.toContain("6502");
    expect(r.grounding.missing).not.toContain("30436");
  });
});

const live = process.env.LIVE === "1" && hasApiKey();
describe.skipIf(!live)("altın örnekler — canlı model (LIVE=1)", () => {
  it.each(dirs)("%s: classify + write + edit", async (d) => {
    const { classify } = await import("../src/classify.js");
    const { write } = await import("../src/write.js");
    const { doc, event, expected } = load(d);
    const c = await classify({ sourceId: event.sourceId, title: event.title, textHead: doc.slice(0, 2000) });
    expect(expected.classify.category).toContain(c.category);
    if (expected.classify.importanceMax !== undefined) expect(c.importance).toBeLessThanOrEqual(expected.classify.importanceMax);
    if (expected.classify.importanceMin !== undefined) expect(c.importance).toBeGreaterThanOrEqual(expected.classify.importanceMin);
    if (expected.classify.isNews !== null) expect(c.isNews).toBe(expected.classify.isNews);
    if (!c.isNews) return; // yazılmaz
    const w = await write({ sourceId: event.sourceId, sourceName: event.sourceName, sourceUrl: event.url, title: event.title, documentText: doc, publishedAt: event.publishedAt, classify: c });
    const r = runEditRules(w, doc, { importance: c.importance, reviewThreshold: 99 });
    expect(r.decision, r.reasons.join("; ")).not.toBe("reject");
    const text = `${w.title}\n${w.dek}\n${w.bodyMarkdown}`.toLocaleLowerCase("tr");
    for (const p of expected.mustNotContain) expect(text).not.toContain(p.toLocaleLowerCase("tr"));
    expect(w.title.length).toBeLessThanOrEqual(70);
  });
});

it("fixture klasörü mevcut", () => expect(existsSync(ROOT)).toBe(true));
