/**
 * Gerçek bir Resmi Gazete gününün fihrist HTML'ini fixture olarak kaydeder.
 * Kullanım: pnpm --filter @kaynak/sources capture -- 2026-09-26
 * Not: resmigazete.gov.tr sertifika zinciri için NODE_EXTRA_CA_CERTS gerekebilir (.env.example'a bak).
 */
import { writeFile } from "node:fs/promises";
import { politeFetch } from "../src/http.js";
import { dayPageUrl } from "../src/resmi-gazete/adapter.js";

const date = process.argv[2];
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error("tarih ver: YYYY-MM-DD"); process.exit(1); }
const url = dayPageUrl("https://www.resmigazete.gov.tr", date);
const res = await politeFetch(url);
const html = await res.text();
const out = new URL(`../fixtures/day-${date}.html`, import.meta.url);
await writeFile(out, html);
console.log(`saved ${html.length} bytes → ${out.pathname}`);
