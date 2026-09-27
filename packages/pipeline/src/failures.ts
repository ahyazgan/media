import { and, eq, isNull } from "drizzle-orm";
import { jobFailures, rawEvents, type Db } from "@kaynak/db";

/** Üç denemeden sonra düşen işi kaydeder (süreç içi ve BullMQ modunda ortak). */
export async function recordFailure(db: Db, f: { queue: string; rawEventId?: string; sourceId?: string; error: string; attempts?: number }) {
  await db.insert(jobFailures).values({ queue: f.queue, rawEventId: f.rawEventId ?? null, sourceId: f.sourceId ?? null, error: f.error.slice(0, 2000), attempts: f.attempts ?? 1 });
}

/** Admin "yeniden dene": kayıt çözüldü sayılır; raw_event `new`e döner, worker'ın bekleyen süpürmesi işler. */
export async function retryFailure(db: Db, id: string, by: string): Promise<void> {
  const [f] = await db.select().from(jobFailures).where(eq(jobFailures.id, id)).limit(1);
  if (!f) throw new Error(`kayıt yok: ${id}`);
  if (f.rawEventId) await db.update(rawEvents).set({ status: "new" }).where(eq(rawEvents.id, f.rawEventId));
  await db.update(jobFailures).set({ resolvedAt: new Date(), error: `${f.error}\n[yeniden denendi: ${by}]` }).where(and(eq(jobFailures.id, id), isNull(jobFailures.resolvedAt)));
}
