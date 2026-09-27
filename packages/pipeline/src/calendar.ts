import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { calendarEvents, type Db, type CalendarEvent } from "@kaynak/db";
import type { CalendarEntry } from "@kaynak/sources";

/** Takvim girdilerini ekler; (institution, title, scheduledAt) zaten varsa atlar. Eklenen sayısını döndürür. */
export async function syncCalendar(db: Db, entries: CalendarEntry[]): Promise<number> {
  let inserted = 0;
  for (const e of entries) {
    const rows = await db.insert(calendarEvents).values({ institution: e.institution, title: e.title, scheduledAt: e.scheduledAt, sourceUrl: e.sourceUrl ?? null })
      .onConflictDoNothing().returning({ id: calendarEvents.id });
    if (rows.length) inserted++;
  }
  return inserted;
}

/** Önümüzdeki `days` günün takvimi (şartname: /takvim 30 gün). */
export async function upcomingEvents(db: Db, opts: { from?: Date; days?: number; limit?: number } = {}): Promise<CalendarEvent[]> {
  const from = opts.from ?? new Date();
  const start = new Date(from.getTime() - 3 * 3_600_000); // birkaç saat öncesi: bugün açıklananlar da listede kalsın
  const end = new Date(from.getTime() + (opts.days ?? 30) * 86_400_000);
  return db.select().from(calendarEvents)
    .where(and(gte(calendarEvents.scheduledAt, start), lt(calendarEvents.scheduledAt, end)))
    .orderBy(asc(calendarEvents.scheduledAt)).limit(opts.limit ?? 200);
}

/**
 * Kurumun takviminde "şimdi"ye yakın bir yayın var mı? Şartname §4: takvim saatinde 30 sn tarama.
 * Pencere: yayından `beforeMin` dk önce başlar, `afterMin` dk sonra biter.
 */
export async function isCalendarHot(db: Db, institution: string, now = new Date(), beforeMin = 5, afterMin = 30): Promise<boolean> {
  const lo = new Date(now.getTime() - afterMin * 60_000);
  const hi = new Date(now.getTime() + beforeMin * 60_000);
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(calendarEvents)
    .where(and(eq(calendarEvents.institution, institution), gte(calendarEvents.scheduledAt, lo), lt(calendarEvents.scheduledAt, hi)));
  return (row?.n ?? 0) > 0;
}

/**
 * Yayınlanan TCMB/TÜİK haberini, aynı kurumun ±`windowHours` saat içindeki bağlanmamış en yakın takvim girdisine iliştirir.
 * Döndürdüğü değer bağlanan girdinin id'si ya da undefined.
 */
export async function linkCalendarEvent(db: Db, institution: string, articleId: string, publishedAt: Date, windowHours = 6): Promise<string | undefined> {
  const lo = new Date(publishedAt.getTime() - windowHours * 3_600_000);
  const hi = new Date(publishedAt.getTime() + windowHours * 3_600_000);
  const candidates = await db.select().from(calendarEvents)
    .where(and(eq(calendarEvents.institution, institution), isNull(calendarEvents.articleId), gte(calendarEvents.scheduledAt, lo), lt(calendarEvents.scheduledAt, hi)));
  if (!candidates.length) return undefined;
  const nearest = candidates.sort((a, b) => Math.abs(a.scheduledAt.getTime() - publishedAt.getTime()) - Math.abs(b.scheduledAt.getTime() - publishedAt.getTime()))[0]!;
  await db.update(calendarEvents).set({ articleId }).where(eq(calendarEvents.id, nearest.id));
  return nearest.id;
}
