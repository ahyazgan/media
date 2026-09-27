import "dotenv/config";
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
  { id: "kap", name: "Kamuyu Aydınlatma Platformu", official: true, baseUrl: "https://www.kap.org.tr", scheduleCron: "market */60s; else */5m", enabled: false },
  { id: "tcmb", name: "Türkiye Cumhuriyet Merkez Bankası", official: true, baseUrl: "https://www.tcmb.gov.tr", scheduleCron: "calendar */30s; else */10m", enabled: false },
  { id: "tuik", name: "Türkiye İstatistik Kurumu", official: true, baseUrl: "https://data.tuik.gov.tr", scheduleCron: "calendar */30s; else */15m", enabled: false },
];

export async function seed(db: Awaited<ReturnType<typeof createDb>>["db"]) {
  for (const s of SEED_SOURCES) {
    await db.insert(sources).values(s).onConflictDoNothing();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/seed.ts")) {
  const handle = await createDb();
  await handle.migrate();
  await seed(handle.db);
  console.log(`[db] seeded ${SEED_SOURCES.length} sources`);
  await handle.close();
}
