/**
 * Süreç içi çalıştırıcı (Redis gerekmez):
 *   pnpm pipeline:run -- --date 2026-09-26          # o günün Resmi Gazete'sini çek ve işle
 *   pnpm pipeline:run -- --since 2026-09-20         # tarihten bugüne
 *   pnpm pipeline:run -- --fixture                  # ağ yok: sources/fixtures + agents/fixtures ile uçtan uca kuru çalıştırma
 *   pnpm pipeline:run -- --date ... --dry-agents    # gerçek belgeler, sahte ajanlar (API anahtarı yok)
 *   pnpm pipeline:run -- --source kap               # KAP: son bildirimleri çek ve işle (--since ile pencere)
 *   pnpm pipeline:run -- --source kap --fixture     # KAP kuru çalıştırma (sentetik fixture)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createDb } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { KapAdapter, ResmiGazeteAdapter, type RawEvent, type SourceAdapter } from "@kaynak/sources";
import { hasApiKey } from "@kaynak/agents";
import { loadEnv } from "./env.js";
import { DiskStore } from "./storage.js";
import { ingestEvents, processPending, SOURCE_NAMES, type Agents } from "./pipeline.js";
import { makeOnPublished } from "./publish.js";
import { liveAgents } from "./liveAgents.js";
import { fakeAgents } from "./fakeAgents.js";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[++i]!);
}

const env = loadEnv();
const handle = await createDb(env.DATABASE_URL);
await handle.migrate();
await seed(handle.db);

const useFake = args.get("fixture") === "true" || args.get("dry-agents") === "true" || !hasApiKey();
if (useFake && !args.has("fixture") && !args.has("dry-agents")) console.warn("[cli] ANTHROPIC_API_KEY yok → sahte ajanlar kullanılıyor (--dry-agents)");
const agents: Agents = useFake ? fakeAgents : liveAgents;

const source = args.get("source") ?? "resmi-gazete";
const since = args.get("since");
let adapter: SourceAdapter;
let events: RawEvent[];
if (source === "kap") {
  const k = new KapAdapter();
  if (args.get("fixture") === "true") {
    events = k.eventsFromJson(JSON.parse(readFileSync(new URL("../../sources/fixtures/kap-disclosures.json", import.meta.url), "utf8")));
    adapter = fixtureAdapter(k, "kap", {
      "1400001": "01-pay-geri-alim", "1400002": "02-yeni-is-iliskisi", "1400003": "03-bedelsiz-sermaye-artirimi",
      "1400004": "04-genel-kurul-cagrisi", "1400005": "05-finansal-rapor", "1400006": "06-genel-bilgi-formu",
    });
  } else {
    adapter = k;
    events = await k.fetchNew(since ? new Date(since) : new Date(Date.now() - 86_400_000));
  }
} else if (source === "resmi-gazete") {
  const rg = new ResmiGazeteAdapter();
  if (args.get("fixture") === "true") {
    const html = readFileSync(new URL("../../sources/fixtures/day-2025-09-26.html", import.meta.url), "utf8");
    events = rg.eventsFromHtml(html, "https://www.resmigazete.gov.tr/eskiler/2025/09/20250926.htm");
    adapter = fixtureAdapter(rg, "resmi-gazete", { "20250926-1": "01-organ-nakli", "20250926-2": "05-kirsehir-merkez", "20250926-3": "04-kilis-doner-sermaye", "20250926-4": "06-kgk-kurul-karari" });
  } else {
    adapter = rg;
    const date = args.get("date");
    if (date) events = await rg.fetchDay(date);
    else events = await rg.fetchNew(since ? new Date(since) : new Date(Date.now() - 86_400_000));
  }
} else {
  console.error(`bilinmeyen kaynak: ${source} (resmi-gazete | kap)`);
  process.exit(1);
}

const inserted = await ingestEvents(handle.db, events);
console.log(`[cli] ${events.length} event, ${inserted.length} yeni`);
const outcomes = await processPending({
  db: handle.db, agents, store: new DiskStore(env.STORAGE_DIR), reviewThreshold: env.REVIEW_THRESHOLD,
  sourceNames: SOURCE_NAMES,
  log: (m, meta) => console.log(`[${m}]`, JSON.stringify(meta)),
  onPublished: makeOnPublished(env),
}, adapter);
const summary = outcomes.reduce<Record<string, number>>((acc, o) => { acc[o.kind] = (acc[o.kind] ?? 0) + 1; return acc; }, {});
console.log("[cli] sonuç:", summary);
await handle.close();

/** Fixture modunda belgeler ağdan değil agents/fixtures/<kaynak>/ altından okunur. */
function fixtureAdapter(base: SourceAdapter, dir: string, map: Record<string, string>): SourceAdapter {
  return {
    id: base.id, official: base.official, schedule: () => base.schedule(), fetchNew: async () => [],
    async fetchDocument(ev) {
      const sub = map[ev.externalId];
      if (!sub) throw new Error(`fixture yok: ${ev.externalId}`);
      const text = readFileSync(new URL(`../../agents/fixtures/${dir}/${sub}/document.txt`, import.meta.url), "utf8");
      return { url: ev.url, mime: "text/html", bytes: Buffer.from(`<html><body><pre>${text}</pre></body></html>`) };
    },
  };
}
