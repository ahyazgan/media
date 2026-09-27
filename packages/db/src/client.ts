import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  dialect: "pglite" | "postgres";
  /** Migration klasörünü uygular (drizzle/ altındaki SQL dosyaları). */
  migrate(): Promise<void>;
  close(): Promise<void>;
}


/** pnpm-workspace.yaml'ı yukarı doğru arar; göreli yollar (data/, storage/, .env) hep köke göre çözülür. */
export function findRepoRoot(from = process.cwd()): string {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return from;
}

export function resolveFromRoot(p: string): string {
  return isAbsolute(p) ? p : join(findRepoRoot(), p);
}

/**
 * DATABASE_URL'e göre bağlantı açar.
 *  - `pglite://memory`         → bellek içi (testler)
 *  - `pglite://./data/kaynak`  → dosyaya yazan gömülü Postgres (Docker'sız geliştirme)
 *  - `postgres://...`          → gerçek Postgres (Docker Compose / üretim)
 */
export async function createDb(url = process.env.DATABASE_URL ?? "pglite://memory"): Promise<DbHandle> {
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const target = url.slice("pglite://".length);
    let client;
    if (target === "memory" || target === "") client = new PGlite();
    else { const dir = resolveFromRoot(target); mkdirSync(dir, { recursive: true }); client = new PGlite(dir); }
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as Db,
      dialect: "pglite",
      migrate: () => migrate(db, { migrationsFolder: migrationsFolder() }),
      close: () => client.close(),
    };
  }
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db: db as unknown as Db,
    dialect: "postgres",
    migrate: () => migrate(db, { migrationsFolder: migrationsFolder() }),
    close: () => pool.end(),
  };
}

function migrationsFolder(): string {
  // Bundler'lar (Next/webpack) import.meta.url tabanlı yolları paketlemeye çalışır; kökten çözmek her ortamda çalışır.
  return process.env.MIGRATIONS_DIR ?? join(findRepoRoot(), "packages", "db", "drizzle");
}
