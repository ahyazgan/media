/**
 * Süreç içi çalıştırıcı (Redis gerekmez):
 *   pnpm pipeline:run -- --date 2026-09-26          # o günün Resmi Gazete'sini çek ve işle
 *   pnpm pipeline:run -- --since 2026-09-20         # tarihten bugüne
 *   pnpm pipeline:run -- --fixture                  # ağ yok: sources/fixtures + agents/fixtures ile uçtan uca kuru çalıştırma
 *   pnpm pipeline:run -- --date ... --dry-agents    # gerçek belgeler, sahte ajanlar (API anahtarı yok)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createDb } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { ResmiGazeteAdapter, type RawEvent, type SourceAdapter } from "@kaynak/sources";
import { hasApiKey } from "@kaynak/agents";
import { loadEnv } from "./env.js";
import { DiskStore } from "./storage.js";
import { ingestEvents, processPending, type Agents } from "./pipeline.js";
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

let adapter: SourceAdapter;
let events: RawEvent[];
if (args.get("fixture") === "true") {
  const html = readFileSync(new URL("../../sources/fixtures/day-2025-09-26.html", import.meta.url), "utf8");
  const rg = new ResmiGazeteAdapter();
  events = rg.eventsFromHtml(html, "https://www.resmigazete.gov.tr/eskiler/2025/09/20250926.htm");
  adapter = fixtureAdapter(rg);
} else {
  const rg = new ResmiGazeteAdapter();
  adapter = rg;
  const date = args.get("date");
  const since = args.get("since");
  if (date) events = await rg.fetchDay(date);
  else events = await rg.fetchNew(since ? new Date(since) : new Date(Date.now() - 86_400_000));
}

const inserted = await ingestEvents(handle.db, events);
console.log(`[cli] ${events.length} event, ${inserted.length} yeni`);
const outcomes = await processPending({
  db: handle.db, agents, store: new DiskStore(env.STORAGE_DIR), reviewThreshold: env.REVIEW_THRESHOLD,
  sourceNames: { "resmi-gazete": "T.C. Resmî Gazete" },
  log: (m, meta) => console.log(`[${m}]`, JSON.stringify(meta)),
  onPublished: makeOnPublished(env),
}, adapter);
const summary = outcomes.reduce<Record<string, number>>((acc, o) => { acc[o.kind] = (acc[o.kind] ?? 0) + 1; return acc; }, {});
console.log("[cli] sonuç:", summary);
await handle.close();

/** Fixture modunda belgeler ağdan değil agents/fixtures'tan okunur. */
function fixtureAdapter(rg: ResmiGazeteAdapter): SourceAdapter {
  const map: Record<string, string> = {
    "20250926-1": "01-organ-nakli", "20250926-2": "05-kirsehir-merkez", "20250926-3": "04-kilis-doner-sermaye", "20250926-4": "06-kgk-kurul-karari",
  };
  return {
    id: rg.id, official: true, schedule: () => rg.schedule(), fetchNew: async () => [],
    async fetchDocument(ev) {
      const dir = map[ev.externalId];
      if (!dir) throw new Error(`fixture yok: ${ev.externalId}`);
      const text = readFileSync(new URL(`../../agents/fixtures/resmi-gazete/${dir}/document.txt`, import.meta.url), "utf8");
      return { url: ev.url, mime: "text/html", bytes: Buffer.from(`<html><body><pre>${text}</pre></body></html>`) };
    },
  };
}
