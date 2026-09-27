/**
 * Worker: REDIS_URL varsa BullMQ kuyrukları (watch → process → publish, calendar, bulletin); yoksa süreç içi zamanlayıcı.
 * Her aşama ayrı job; 3 deneme, sonra `dead` kuyruğu (admin Faz 4'te listeler).
 * Taranacak kaynaklar `sources.enabled`'dan okunur (KAP varsayılan kapalı: `pnpm db:seed -- --enable kap`).
 */
import "dotenv/config";
import { createDb } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { eq } from "drizzle-orm";
import { rawEvents, sources } from "@kaynak/db";
import { importCalendars, KapAdapter, ResmiGazeteAdapter, TcmbAdapter, TuikAdapter, intervalFor, type SourceAdapter } from "@kaynak/sources";
import { hasApiKey } from "@kaynak/agents";
import {
  createMailer, createPushSender, DiskStore, fakeAgents, ingestEvents, isCalendarHot, liveAgents, loadEnv, makeOnPublished,
  msUntilNext, processEvent, sendBulletin, SOURCE_NAMES, syncCalendar, type PipelineDeps,
} from "@kaynak/pipeline";

const env = loadEnv();
const handle = await createDb(env.DATABASE_URL);
await handle.migrate();
await seed(handle.db);
const log = (m: string, meta?: Record<string, unknown>) => console.log(new Date().toISOString(), `[${m}]`, JSON.stringify(meta ?? {}));

const registry: SourceAdapter[] = [new ResmiGazeteAdapter(), new KapAdapter(), new TcmbAdapter({ feedUrl: env.TCMB_FEED_URL }), new TuikAdapter({ feedUrl: env.TUIK_FEED_URL })];
const enabledIds = new Set((await handle.db.select({ id: sources.id }).from(sources).where(eq(sources.enabled, true))).map((r) => r.id));
const adapters = registry.filter((a) => enabledIds.has(a.id));
const byId = new Map(registry.map((a) => [a.id, a]));
log("worker:start", { sources: registry.map((a) => `${a.id}${enabledIds.has(a.id) ? "" : " (kapalı)"}`), agents: hasApiKey() ? "live" : "fake", push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), telegram: Boolean(env.TELEGRAM_BOT_TOKEN), bulletin: env.BULLETIN_TIME });
if (!hasApiKey()) console.warn("[worker] ANTHROPIC_API_KEY yok → sahte ajanlar (yayın kalitesi beklenmez)");

const push = await createPushSender(env);
const deps: PipelineDeps = {
  db: handle.db, agents: hasApiKey() ? liveAgents : fakeAgents, store: new DiskStore(env.STORAGE_DIR),
  reviewThreshold: env.REVIEW_THRESHOLD, sourceNames: SOURCE_NAMES, log,
  onPublished: makeOnPublished(env, { db: handle.db, push, log }),
};

/** Takvim saatine yakınsa (TCMB/TÜİK) sık tarama; aksi halde adapter'ın kendi penceresi. */
async function intervalMs(a: SourceAdapter): Promise<number> {
  const hot = a.schedule().hotEverySeconds ? await isCalendarHot(handle.db, a.id) : false;
  return intervalFor(a.schedule(), new Date(), hot) * 1000;
}
async function watch(adapter: SourceAdapter, since: Date) {
  const events = await adapter.fetchNew(since);
  const inserted = await ingestEvents(handle.db, events);
  log("watch", { source: adapter.id, fetched: events.length, new: inserted.length });
  return inserted.map((r) => r.id);
}
async function processOne(rawEventId: string) {
  const [row] = await handle.db.select().from(rawEvents).where(eq(rawEvents.id, rawEventId)).limit(1);
  if (!row) throw new Error(`raw_event yok: ${rawEventId}`);
  const adapter = byId.get(row.sourceId);
  if (!adapter) throw new Error(`adapter yok: ${row.sourceId}`);
  return processEvent(deps, adapter, row);
}
async function calendarSync() {
  const r = await importCalendars({ tuikUrl: env.TUIK_CALENDAR_URL, tcmbUrl: env.TCMB_CALENDAR_URL, year: new Date().getFullYear() });
  for (const e of r.errors) log("calendar:error", e);
  const inserted = await syncCalendar(handle.db, r.entries);
  log("calendar", { parsed: r.entries.length, inserted });
}
async function bulletin() {
  const mailer = await createMailer(env);
  const r = await sendBulletin(handle.db, mailer, env, { log });
  log("bulletin:done", { transport: mailer.kind, sent: r.sent, failed: r.failed });
}
const WATCH_SINCE = () => new Date(Date.now() - 2 * 86_400_000);

if (env.REDIS_URL) {
  const { Queue, Worker } = await import("bullmq");
  const { Redis } = await import("ioredis");
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const opts = { attempts: 3, backoff: { type: "exponential" as const, delay: 5000 }, removeOnComplete: 500, removeOnFail: false };
  const qWatch = new Queue("watch", { connection, defaultJobOptions: opts });
  const qProcess = new Queue("process", { connection, defaultJobOptions: opts });
  const qJobs = new Queue("jobs", { connection, defaultJobOptions: opts });
  const qDead = new Queue("dead", { connection });

  for (const a of adapters) {
    // Zaman pencerelerine (ve takvime) göre tekrarlayan job: her koşuda aralık yeniden hesaplanır.
    await qWatch.upsertJobScheduler(`watch:${a.id}`, { every: await intervalMs(a) }, { name: "watch", data: { sourceId: a.id } });
  }
  new Worker("watch", async (job) => {
    const a = byId.get(job.data.sourceId as string)!;
    const ids = await watch(a, WATCH_SINCE());
    for (const id of ids) await qProcess.add("process", { rawEventId: id }, { jobId: `process:${id}` });
    await qWatch.upsertJobScheduler(`watch:${a.id}`, { every: await intervalMs(a) }, { name: "watch", data: { sourceId: a.id } });
  }, { connection, concurrency: 1 });
  const pw = new Worker("process", async (job) => processOne(job.data.rawEventId as string), { connection, concurrency: 2 });
  pw.on("failed", async (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) await qDead.add("dead", { queue: "process", data: job.data, error: err.message, failedAt: new Date().toISOString() });
  });

  // Takvim: her gün 03:15 TR (ay başında tablo yenilenir; günlük çekmek ucuz ve idempotent). Bülten: BULLETIN_TIME (varsayılan 07:30 TR).
  const [bh, bm] = env.BULLETIN_TIME.split(":");
  await qJobs.upsertJobScheduler("calendar", { pattern: "15 3 * * *", tz: "Europe/Istanbul" }, { name: "calendar" });
  await qJobs.upsertJobScheduler("bulletin", { pattern: `${Number(bm)} ${Number(bh)} * * *`, tz: "Europe/Istanbul" }, { name: "bulletin" });
  await qJobs.add("calendar", {}, { jobId: `calendar:boot:${Date.now()}` });
  new Worker("jobs", async (job) => { if (job.name === "calendar") await calendarSync(); else if (job.name === "bulletin") await bulletin(); }, { connection, concurrency: 1 });
  log("worker:mode", { mode: "bullmq", redis: env.REDIS_URL });
} else {
  log("worker:mode", { mode: "in-process" });
  const loop = async (a: SourceAdapter) => {
    try {
      const ids = await watch(a, WATCH_SINCE());
      for (const id of ids) { try { await processOne(id); } catch (e) { console.error("[process] hata", id, (e as Error).message); } }
    } catch (e) { console.error("[watch] hata", a.id, (e as Error).message); }
    setTimeout(() => loop(a), await intervalMs(a));
  };
  for (const a of adapters) void loop(a);

  const calendarLoop = async () => {
    try { await calendarSync(); } catch (e) { console.error("[calendar] hata", (e as Error).message); }
    setTimeout(calendarLoop, 24 * 3_600_000);
  };
  void calendarLoop();
  const bulletinLoop = () => setTimeout(async () => {
    try { await bulletin(); } catch (e) { console.error("[bulletin] hata", (e as Error).message); }
    bulletinLoop();
  }, msUntilNext(env.BULLETIN_TIME));
  bulletinLoop();
}
