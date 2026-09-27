/**
 * Worker: REDIS_URL varsa BullMQ kuyrukları (watch → process → publish); yoksa süreç içi zamanlayıcı.
 * Her aşama ayrı job; 3 deneme, sonra `dead` kuyruğu (admin Faz 4'te listeler).
 */
import "dotenv/config";
import { createDb } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { eq } from "drizzle-orm";
import { rawEvents } from "@kaynak/db";
import { ResmiGazeteAdapter, intervalFor, type SourceAdapter } from "@kaynak/sources";
import { hasApiKey } from "@kaynak/agents";
import { DiskStore, fakeAgents, ingestEvents, liveAgents, loadEnv, makeOnPublished, processEvent, type PipelineDeps } from "@kaynak/pipeline";

const env = loadEnv();
const handle = await createDb(env.DATABASE_URL);
await handle.migrate();
await seed(handle.db);

const adapters: SourceAdapter[] = [new ResmiGazeteAdapter()];
const byId = new Map(adapters.map((a) => [a.id, a]));
if (!hasApiKey()) console.warn("[worker] ANTHROPIC_API_KEY yok → sahte ajanlar (yayın kalitesi beklenmez)");
const deps: PipelineDeps = {
  db: handle.db, agents: hasApiKey() ? liveAgents : fakeAgents, store: new DiskStore(env.STORAGE_DIR),
  reviewThreshold: env.REVIEW_THRESHOLD, sourceNames: { "resmi-gazete": "T.C. Resmî Gazete" },
  log: (m, meta) => console.log(new Date().toISOString(), `[${m}]`, JSON.stringify(meta ?? {})),
  onPublished: makeOnPublished(env),
};

async function watch(adapter: SourceAdapter, since: Date) {
  const events = await adapter.fetchNew(since);
  const inserted = await ingestEvents(handle.db, events);
  deps.log?.("watch", { source: adapter.id, fetched: events.length, new: inserted.length });
  return inserted.map((r) => r.id);
}
async function processOne(rawEventId: string) {
  const [row] = await handle.db.select().from(rawEvents).where(eq(rawEvents.id, rawEventId)).limit(1);
  if (!row) throw new Error(`raw_event yok: ${rawEventId}`);
  const adapter = byId.get(row.sourceId);
  if (!adapter) throw new Error(`adapter yok: ${row.sourceId}`);
  return processEvent(deps, adapter, row);
}

if (env.REDIS_URL) {
  const { Queue, Worker } = await import("bullmq");
  const { Redis } = await import("ioredis");
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const opts = { attempts: 3, backoff: { type: "exponential" as const, delay: 5000 }, removeOnComplete: 500, removeOnFail: false };
  const qWatch = new Queue("watch", { connection, defaultJobOptions: opts });
  const qProcess = new Queue("process", { connection, defaultJobOptions: opts });
  const qDead = new Queue("dead", { connection });

  for (const a of adapters) {
    // Zaman pencerelerine göre tekrarlayan job: aralık değiştiğinde yeniden planlanır.
    const every = intervalFor(a.schedule()) * 1000;
    await qWatch.upsertJobScheduler(`watch:${a.id}`, { every }, { name: "watch", data: { sourceId: a.id } });
  }
  new Worker("watch", async (job) => {
    const a = byId.get(job.data.sourceId as string)!;
    const ids = await watch(a, new Date(Date.now() - 2 * 86_400_000));
    for (const id of ids) await qProcess.add("process", { rawEventId: id }, { jobId: `process:${id}` });
    const every = intervalFor(a.schedule()) * 1000;
    await qWatch.upsertJobScheduler(`watch:${a.id}`, { every }, { name: "watch", data: { sourceId: a.id } });
  }, { connection, concurrency: 1 });
  const pw = new Worker("process", async (job) => processOne(job.data.rawEventId as string), { connection, concurrency: 2 });
  pw.on("failed", async (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) await qDead.add("dead", { queue: "process", data: job.data, error: err.message, failedAt: new Date().toISOString() });
  });
  console.log("[worker] BullMQ modunda çalışıyor", { redis: env.REDIS_URL });
} else {
  console.log("[worker] REDIS_URL yok → süreç içi zamanlayıcı");
  const loop = async (a: SourceAdapter) => {
    try {
      const ids = await watch(a, new Date(Date.now() - 2 * 86_400_000));
      for (const id of ids) { try { await processOne(id); } catch (e) { console.error("[process] hata", id, (e as Error).message); } }
    } catch (e) { console.error("[watch] hata", a.id, (e as Error).message); }
    setTimeout(() => loop(a), intervalFor(a.schedule()) * 1000);
  };
  for (const a of adapters) void loop(a);
}
