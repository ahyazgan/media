/**
 * Uçtan uca prova: gerçek Postgres + Redis, gerçek worker (BullMQ kuyrukları) ve web (next start) süreçleri.
 * Kaynak siteleri ve Telegram sahte sunucudadır; ajanlar sahtedir (API anahtarı gerekmez).
 *
 *   pnpm --filter @kaynak/web build
 *   DATABASE_URL=postgres://… REDIS_URL=redis://… pnpm rehearsal
 *
 * Senaryo: yayın akışı (olay → haber → revalidate → RSS → Telegram) → Resmi Gazete "yeniden tasarlanır" → alarm → düzelir → iyileşme bildirimi.
 * Rapor: rehearsal-results/rapor.md (+ web.log, worker.log). Bir kontrol kalırsa çıkış kodu 1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createDb, findRepoRoot, articles, jobFailures, rawEvents, sourceHealth, sources } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { startMockServer } from "./mockServer.js";
import { get, startProc, stopProc, waitFor, type Proc } from "./procs.js";

const ROOT = findRepoRoot();
const OUT = join(ROOT, "rehearsal-results");
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const REDIS_URL = process.env.REDIS_URL ?? "";
const PORT = Number(process.env.REHEARSAL_WEB_PORT ?? 3100);
const SITE = `http://127.0.0.1:${PORT}`;
if (!DATABASE_URL.startsWith("postgres") || !REDIS_URL) {
  console.error("Prova gerçek Postgres ve Redis ister: DATABASE_URL=postgres://… REDIS_URL=redis://…");
  process.exit(2);
}
mkdirSync(join(OUT, "storage"), { recursive: true });

const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => { checks.push({ name, ok, detail }); console.log(`[prova] ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); };

const mock = await startMockServer();
const h = await createDb(DATABASE_URL);
await h.migrate();
await seed(h.db);
await h.db.update(sources).set({ enabled: false });
await h.db.update(sources).set({ enabled: true }).where(inArray(sources.id, ["resmi-gazete", "kap"]));

const base: NodeJS.ProcessEnv = {
  ...process.env, DATABASE_URL, SITE_URL: SITE, REVALIDATE_SECRET: "prova-revalidate", ADMIN_USER: "prova", ADMIN_PASSWORD: "prova-sifre-123",
  ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", NODE_ENV: "production",
};
let web: Proc | undefined, worker: Proc | undefined;
/** Hız ölçümü (ms): kaynak yayını → tespit → yayın → Telegram / ana sayfa */
const timing: Record<string, { detect: number; process: number; telegram: number | null; site: number | null }> = {};
let processDist: number[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
const n = sql<number>`count(*)::int`;

try {
  web = startProc("web", "pnpm", ["--filter", "@kaynak/web", "exec", "next", "start", "-p", String(PORT), "-H", "127.0.0.1"], base, ROOT, join(OUT, "web.log"));
  check("web ayağa kalktı", await waitFor("web /api/health", async () => (await get(`${SITE}/api/health`)).status === 200, 120_000));

  // Kaynaklar henüz yayımlamamış gibi başlar (hız ölçümü için)
  mock.setRg("pending"); mock.setKap("pending");
  worker = startProc("worker", "pnpm", ["--filter", "@kaynak/worker", "start"], {
    ...base, REDIS_URL, RG_BASE_URL: mock.url, KAP_BASE_URL: mock.url, TELEGRAM_API_BASE: mock.url, TELEGRAM_BOT_TOKEN: "prova",
    TELEGRAM_CHANNEL_ID: "@kaynak_prova", ALERT_TELEGRAM_CHAT_ID: "@editor_prova", WATCH_EVERY_SECONDS: "8", STORAGE_DIR: join(OUT, "storage"),
  }, ROOT, join(OUT, "worker.log"));

  // 0) Hız ölçümü: kaynak belirli bir anda yayımlar; her aşamanın süresi kaydedilir.
  await waitFor("worker taramaya başladı", async () => (mock.hits["rg:day"] ?? 0) > 0 && (mock.hits["kap:list"] ?? 0) > 0, 120_000, 500);
  await sleep(3000);
  const tPub = Date.now();
  mock.setRg("normal"); mock.setKap("normal");
  const firstPublished = async (src: string) => (await h.db.select({ slug: articles.slug, title: articles.title, publishedAt: articles.publishedAt, detectedAt: rawEvents.createdAt })
    .from(articles).innerJoin(rawEvents, eq(rawEvents.id, articles.rawEventId))
    .where(and(eq(rawEvents.sourceId, src), eq(articles.status, "published"))).orderBy(articles.publishedAt).limit(1))[0];
  await waitFor("ilk yayınlar (hız)", async () => Boolean(await firstPublished("resmi-gazete")) && Boolean(await firstPublished("kap")), 180_000, 500);
  for (const src of ["resmi-gazete", "kap"]) {
    const a = await firstPublished(src);
    if (!a?.publishedAt) continue;
    const pubAt = a.publishedAt.getTime(), detAt = new Date(a.detectedAt).getTime();
    const box = { tg: null as number | null, site: null as number | null };
    await waitFor(`${src} Telegram`, async () => { const m = mock.telegram.find((c) => c.text.includes(a.slug)); if (m) box.tg = Date.parse(m.at); return Boolean(m); }, 30_000, 250);
    const head = a.title.slice(0, 30).replace(/&/g, "&amp;");
    await waitFor(`${src} ana sayfada`, async () => { const ok = (await get(`${SITE}/`)).text.includes(head); if (ok) box.site = Date.now(); return ok; }, 60_000, 500);
    timing[src] = { detect: detAt - tPub, process: pubAt - detAt, telegram: box.tg === null ? null : box.tg - pubAt, site: box.site === null ? null : box.site - pubAt };
  }
  check("hız ölçümü tamamlandı (Resmi Gazete + KAP)", Boolean(timing["resmi-gazete"] && timing["kap"]), JSON.stringify(timing));

  // 1) Yayın akışı
  const published = () => count(h.db.select({ n }).from(articles).where(eq(articles.status, "published")));
  const channel = () => mock.telegram.filter((c) => c.chatId === "@kaynak_prova");
  check("haber yayınlandı ve Telegram kanalına düştü", await waitFor("ilk yayın", async () => (await published()) >= 1 && channel().length >= 1, 240_000));
  check("worker BullMQ modunda", /"mode":"bullmq"/.test(worker.output()), "worker.log: worker:mode");

  const rgCount = () => count(h.db.select({ n }).from(rawEvents).where(eq(rawEvents.sourceId, "resmi-gazete")));
  const before = await rgCount();
  await new Promise((r) => setTimeout(r, 25_000)); // en az iki tarama döngüsü
  const after = await rgCount();
  check("tekrar taramada tekilleştirme (olay sayısı sabit)", before > 0 && before === after, `${before} → ${after}`);

  const rgSkipped = await count(h.db.select({ n }).from(rawEvents).where(and(eq(rawEvents.sourceId, "resmi-gazete"), eq(rawEvents.status, "skipped"))));
  check("haber değeri olmayan maddeler atlandı (isNews=false)", rgSkipped >= 2, `${rgSkipped} madde`);
  const kapEvents = await count(h.db.select({ n }).from(rawEvents).where(eq(rawEvents.sourceId, "kap")));
  check("KAP bildirimleri alındı", kapEvents > 0, `${kapEvents} bildirim`);
  const failures = await count(h.db.select({ n }).from(jobFailures));
  check("düşen iş yok", failures === 0, `${failures} kayıt`);

  const [first] = await h.db.select().from(articles).where(eq(articles.status, "published")).limit(1);
  const msgs = channel().map((c) => c.text).join("\n");
  check("Telegram mesajı haber bağlantısı içeriyor", Boolean(first) && msgs.includes("/haber/"), `${channel().length} mesaj`);
  check("haber sayfası açılıyor", first ? (await get(`${SITE}/haber/${first.slug}`)).status === 200 : false, first?.slug ?? "—");
  const titleHead = (first?.title ?? "").slice(0, 30).replace(/&/g, "&amp;");
  check("revalidate: ana sayfada yeni haber", await waitFor("ana sayfa", async () => (await get(`${SITE}/`)).text.includes(titleHead), 60_000, 3000), titleHead);
  check("RSS'te haber", (await get(`${SITE}/rss.xml`)).text.includes("/haber/"));
  const sh = await get(`${SITE}/api/health/sources`);
  check("kaynak sağlığı ucu 200", sh.status === 200, sh.text.slice(0, 160));

  // 2) Resmi Gazete sitesi "yeniden tasarlanır" → yapı hatası alarmı
  mock.setRg("broken");
  const rgStatus = async () => (await h.db.select().from(sourceHealth).where(eq(sourceHealth.sourceId, "resmi-gazete")))[0]?.status;
  const editor = () => mock.telegram.filter((c) => c.chatId === "@editor_prova").map((c) => c.text);
  check("yapı değişikliği BOZUK olarak işaretlendi", await waitFor("failing", async () => (await rgStatus()) === "failing", 90_000));
  check("editöre alarm gitti", await waitFor("alarm", async () => editor().some((t) => t.includes("BOZUK")), 30_000), editor()[0]?.split("\n")[0] ?? "—");
  check("kaynak sağlığı ucu 503", (await get(`${SITE}/api/health/sources`)).status === 503);
  check("canlılık ucu etkilenmedi (200)", (await get(`${SITE}/api/health`)).status === 200);

  // 3) Düzelir → iyileşme bildirimi
  mock.setRg("normal");
  check("kaynak yeniden çalışıyor", await waitFor("ok", async () => (await rgStatus()) === "ok", 90_000));
  check("iyileşme bildirimi gitti", await waitFor("recovered", async () => editor().some((t) => t.includes("yeniden çalışıyor")), 30_000));
  check("alarm tekrarlanmadı (tek BOZUK mesajı)", editor().filter((t) => t.includes("BOZUK")).length === 1, `${editor().length} editör mesajı`);
  // Tüm yayınlanan haberlerde işleme süresi dağılımı (tespit → yayın)
  const all = await h.db.select({ p: articles.publishedAt, d: rawEvents.createdAt }).from(articles).innerJoin(rawEvents, eq(rawEvents.id, articles.rawEventId)).where(eq(articles.status, "published"));
  processDist = all.filter((r) => r.p).map((r) => r.p!.getTime() - new Date(r.d).getTime()).sort((x, y) => x - y);
} catch (e) {
  check("prova beklenmedik hatayla durdu", false, (e as Error).stack?.split("\n").slice(0, 3).join(" / ") ?? String(e));
} finally {
  stopProc(worker); stopProc(web);
  await mock.close().catch(() => {});
  await h.close().catch(() => {});
}

const sec = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} sn`);
const pct = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)] : undefined);
const failed = checks.filter((c) => !c.ok);
const md = [
  `# Uçtan uca prova — ${new Date().toISOString()}`, "",
  `Sonuç: **${checks.length - failed.length}/${checks.length}** kontrol geçti.`, "",
  "| | Kontrol | Ayrıntı |", "|---|---|---|",
  ...checks.map((c) => `| ${c.ok ? "✅" : "❌"} | ${c.name} | ${c.detail.replace(/\|/g, "/")} |`), "",
  "## Hız (kaynak yayını → sizin siteniz)", "",
  "Provada tarama aralığı 8 sn, ajanlar sahte (yapay zekâ süresi hariç). Tespit süresi üretimde tarama aralığına bağlıdır.", "",
  "| Aşama | Resmi Gazete | KAP |", "|---|---|---|",
  ...([["Tespit (kaynak yayını → sistem fark etti)", "detect"], ["İşleme (belge + sınıflandırma + yazım + kontrol + kayıt)", "process"], ["Telegram'a gidiş (yayından sonra)", "telegram"], ["Ana sayfada görünme (yayından sonra)", "site"]] as const)
    .map(([label, k]) => `| ${label} | ${sec(timing["resmi-gazete"]?.[k])} | ${sec(timing["kap"]?.[k])} |`),
  "",
  `Tüm haberlerde işleme süresi (${processDist.length} haber): medyan ${sec(pct(processDist, 50))}, p95 ${sec(pct(processDist, 95))}, en uzun ${sec(processDist.at(-1))}`, "",
  `Sahte sunucu istekleri: ${JSON.stringify(mock.hits)}`, "", "Günlükler: web.log, worker.log, hiz.json",
].join("\n");
writeFileSync(join(OUT, "rapor.md"), md + "\n");
console.log(`\n${md}`);
writeFileSync(join(OUT, "hiz.json"), JSON.stringify({ timing, processDist }, null, 2));
process.exit(failed.length ? 1 : 0);
