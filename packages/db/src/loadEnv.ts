import { config } from "dotenv";
import { join } from "node:path";
import { findRepoRoot } from "./client.ts";

/**
 * db betikleri (migrate, seed) pnpm --filter ile packages/db klasöründe çalışır; "dotenv/config" orada .env bulamaz ve
 * DATABASE_URL boş kalınca bağlantı sessizce bellek içi PGlite'a düşerdi (yazılanlar kaybolur). Kök .env okunur; var olan
 * ortam değişkenleri ezilmez.
 */
config({ path: join(findRepoRoot(), ".env"), quiet: true });
