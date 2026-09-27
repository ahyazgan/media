import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "./client.ts";
import { sources } from "./schema.ts";

export const SEED_SOURCES: (typeof sources.$inferInsert)[] = [
  {
    id: "resmi-gazete",
    name: "T.C. Resmî Gazete",
    official: true,
    baseUrl: "https://www.resmigazete.gov.tr",
    scheduleCron: "06:00-10:00 */3m; else */30m",
    enabled: true,
  },
  // KAP: kullanım koşulları okunup onaylanana kadar kapalı gelir (şartname §10); `pnpm db:seed -- --enable kap` ile açılır.
  { id: "kap", name: "Kamuyu Aydınlatma Platformu", official: true, baseUrl: "https://www.kap.org.tr", scheduleCron: "market */60s; else */5m", enabled: false },
  { id: "tcmb", name: "Türkiye Cumhuriyet Merkez Bankası", official: true, baseUrl: "https://www.tcmb.gov.tr", scheduleCron: "calendar */30s; else */10m", enabled: false },
  { id: "tuik", name: "Türkiye İstatistik Kurumu", official: true, baseUrl: "https://data.tuik.gov.tr", scheduleCron: "calendar */30s; else */15m", enabled: false },
];

export async function seed(db: Awaited<ReturnType<typeof createDb>>["db"]) {
  for (const s of SEED_SOURCES) {
    await db.insert(sources).values(s).onConflictDoNothing();
  }
}

/** Bir kaynağı açar/kapatır: `pnpm db:seed -- --enable kap` / `--disable kap`. */
export async function setSourceEnabled(db: Awaited<ReturnType<typeof createDb>>["db"], id: string, enabled: boolean) {
  const rows = await db.update(sources).set({ enabled }).where(eq(sources.id, id)).returning({ id: sources.id });
  if (rows.length === 0) throw new Error(`kaynak yok: ${id}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/seed.ts")) {
  const handle = await createDb();
  await handle.migrate();
  await seed(handle.db);
  console.log(`[db] seeded ${SEED_SOURCES.length} sources`);
  const argv = process.argv.slice(2);
  for (const flag of ["enable", "disable"] as const) {
    const i = argv.indexOf(`--${flag}`);
    if (i >= 0 && argv[i + 1]) { await setSourceEnabled(handle.db, argv[i + 1]!, flag === "enable"); console.log(`[db] ${argv[i + 1]} → ${flag}d`); }
  }
  await handle.close();
}
