/**
 * KAP bildirim listesinin gerçek bir kopyasını fixture olarak kaydeder.
 * Kullanım: pnpm --filter @kaynak/sources capture:kap
 * Çıktı: fixtures/kap-disclosures-YYYY-MM-DD.json — alan adlarını parse.ts'teki eş anlamlılarla karşılaştır.
 */
import { writeFile } from "node:fs/promises";
import { politeFetch } from "../src/http.js";
import { KapAdapter } from "../src/kap/adapter.js";

const adapter = new KapAdapter();
const res = await politeFetch(adapter.listUrl(), { headers: { accept: "application/json" } });
const text = await res.text();
const date = new Date().toISOString().slice(0, 10);
const out = new URL(`../fixtures/kap-disclosures-${date}.json`, import.meta.url);
await writeFile(out, text);
const events = adapter.eventsFromJson(JSON.parse(text));
console.log(`saved ${text.length} bytes → ${out.pathname}; ${events.length} event ayrıştırıldı`);
if (events.length === 0) console.warn("UYARI: hiç event ayrışmadı — KAP alan adları değişmiş olabilir, parse.ts'i güncelle.");
