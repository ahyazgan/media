import { and, eq, inArray, isNull, like, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { articles, jobFailures, rawEvents, type Db } from "@kaynak/db";

/** Üç denemeden sonra düşen işi kaydeder (süreç içi ve BullMQ modunda ortak). */
export async function recordFailure(db: Db, f: { queue: string; rawEventId?: string; sourceId?: string; error: string; attempts?: number }) {
  await db.insert(jobFailures).values({ queue: f.queue, rawEventId: f.rawEventId ?? null, sourceId: f.sourceId ?? null, error: f.error.slice(0, 2000), attempts: f.attempts ?? 1 });
}

/** Admin "yeniden dene": kayıt çözüldü sayılır; raw_event `new`e döner, worker'ın bekleyen süpürmesi işler. */
export async function retryFailure(db: Db, id: string, by: string): Promise<void> {
  const [f] = await db.select().from(jobFailures).where(eq(jobFailures.id, id)).limit(1);
  if (!f) throw new Error(`kayıt yok: ${id}`);
  if (f.rawEventId) await db.update(rawEvents).set({ status: "new", claimedAt: null }).where(eq(rawEvents.id, f.rawEventId));
  await db.update(jobFailures).set({ resolvedAt: new Date(), error: `${f.error}\n[yeniden denendi: ${by}]` }).where(and(eq(jobFailures.id, id), isNull(jobFailures.resolvedAt)));
}

/**
 * Sayı kontrolünde reddedilen olayları yeniden kuyruğa alır (ör. metin çıkarımı düzeltildikten sonra). Reddedilen taslak kayıt olarak
 * kalır (silme yok); olay `new`e döner, bekleyen süpürmesi belgeyi yeniden indirip baştan işler. Aynı olaydan yayında/incelemede
 * tam metin varsa alınmaz (çift haber olmasın); yayındaki flaş yeniden kullanılır. Döndürür: kuyruğa alınan olay kimlikleri.
 */
export async function requeueRejected(db: Db, opts: { sourceId?: string; dryRun?: boolean } = {}): Promise<string[]> {
  const other = alias(articles, "other");
  const rows = await db.selectDistinct({ id: rawEvents.id }).from(articles)
    .innerJoin(rawEvents, eq(rawEvents.id, articles.rawEventId))
    .where(and(
      eq(articles.status, "rejected"), like(articles.editorNote, "numericGroundingCheck%"), ne(rawEvents.status, "new"),
      opts.sourceId ? eq(rawEvents.sourceId, opts.sourceId) : undefined,
      notExists(db.select({ one: sql`1` }).from(other).where(and(
        eq(other.rawEventId, rawEvents.id), inArray(other.status, ["published", "corrected", "review"]), eq(other.isFlash, false),
      ))),
    ));
  const ids = rows.map((r) => r.id);
  if (!opts.dryRun && ids.length) await db.update(rawEvents).set({ status: "new", claimedAt: null }).where(inArray(rawEvents.id, ids));
  return ids;
}
