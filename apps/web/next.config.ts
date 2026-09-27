import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

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
  transpilePackages: ["@kaynak/ui", "@kaynak/pipeline"],
  // PGlite (wasm + import.meta.url) ve drizzle sürücüleri Node tarafında paketlenmez.
  // @kaynak/db Node'un yerel TypeScript yükleyicisiyle (Node ≥ 22.6 tip soyma) gerçek Node realm'inde çalışır;
  // PGlite'ın wasm/URL yükleyicisi Next dev sandbox'ında bozulur, bu yüzden paketlenmez.
  serverExternalPackages: ["@kaynak/db", "@electric-sql/pglite", "pg", "drizzle-orm", "nodemailer", "web-push"],
  poweredByHeader: false,
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return cfg;
  },
  turbopack: { resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"] },
  // IndexNow anahtar dosyası: /<key>.txt (public/ dosyaları önceliklidir; robots.txt etkilenmez)
  rewrites: async () => [{ source: "/:key([A-Za-z0-9-]{8,128}).txt", destination: "/api/indexnow?key=:key" }],
  headers: async () => [
    { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    { source: "/_dev/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
  ],
};
// Service worker (şartname §7). Geliştirmede kapalı (PWA_DEV=1 ile açılır); `next build` public/sw.js üretir.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" && process.env.PWA_DEV !== "1",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  additionalPrecacheEntries: [{ url: "/~offline", revision: String(Date.now()) }],
  // /_dev/ui rotasının klasör adı "%5Fdev"dir; parça URL'si sunucudan 400 döner ve precache kurulumu takılır. Geliştirici sayfası çevrimdışı gerekmez.
  exclude: [/\.map$/, /^manifest.*\.js$/, /%5Fdev|_dev\//],
});
export default withSerwist(config);
