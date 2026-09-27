import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Monorepo kökündeki .env'yi yükle (Next yalnızca apps/web/.env okur). Var olan değerler ezilmez.
const rootEnv = join(process.cwd(), "..", "..", ".env");
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (m && m[2] !== "" && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace paketleri kaynak (.ts/.tsx) olarak tüketilir; NodeNext tarzı ".js" içe aktarımları .ts'e çözülür.
  transpilePackages: ["@kaynak/ui"],
  // PGlite (wasm + import.meta.url) ve drizzle sürücüleri Node tarafında paketlenmez.
  // @kaynak/db Node'un yerel TypeScript yükleyicisiyle (Node ≥ 22.6 tip soyma) gerçek Node realm'inde çalışır;
  // PGlite'ın wasm/URL yükleyicisi Next dev sandbox'ında bozulur, bu yüzden paketlenmez.
  serverExternalPackages: ["@kaynak/db", "@electric-sql/pglite", "pg", "drizzle-orm"],
  poweredByHeader: false,
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return cfg;
  },
  turbopack: { resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"] },
  headers: async () => [
    { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    { source: "/_dev/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
  ],
};
export default config;
