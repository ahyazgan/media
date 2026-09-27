import { readdirSync, readFileSync, existsSync } from "node:fs";

export interface FixtureExpected {
  classify: { category: string[]; importanceMin?: number; importanceMax?: number; isNews: boolean | null };
  mustGround: string[];
  mustNotContain: string[];
  note?: string;
}

export interface FixtureEvent {
  sourceId: string;
  sourceName: string;
  externalId: string;
  title: string;
  url: string;
  publishedAt: string;
  payload?: Record<string, unknown>;
  synthetic?: boolean;
}

export interface Fixture {
  /** "kaynak/NN-slug" */
  id: string;
  source: string;
  doc: string;
  event: FixtureEvent;
  expected: FixtureExpected;
}

export const DEFAULT_FIXTURE_ROOT = new URL("../../fixtures/", import.meta.url);

/** Tüm altın örnekler (99-* bilerek bozuk örnekler hariç), kaynak ve ad süzgeçli. */
export function loadFixtures(opts: { root?: URL; sources?: string[]; only?: string } = {}): Fixture[] {
  const root = opts.root ?? DEFAULT_FIXTURE_ROOT;
  const sources = opts.sources?.length
    ? opts.sources
    : readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const out: Fixture[] = [];
  for (const source of sources) {
    const dir = new URL(`${source}/`, root);
    if (!existsSync(dir)) throw new Error(`fixture kaynağı yok: ${source}`);
    for (const name of readdirSync(dir).filter((d) => /^\d\d-/.test(d) && !d.startsWith("99")).sort()) {
      const id = `${source}/${name}`;
      if (opts.only && !id.includes(opts.only)) continue;
      const read = (f: string) => readFileSync(new URL(`${name}/${f}`, dir), "utf8");
      out.push({
        id, source,
        doc: read("document.txt"),
        event: JSON.parse(read("event.json")) as FixtureEvent,
        expected: JSON.parse(read("expected.json")) as FixtureExpected,
      });
    }
  }
  return out;
}
