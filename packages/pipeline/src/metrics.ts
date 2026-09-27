/**
 * Ölçütler (şartname §11): kaynaktan yayına süre (p50/p95), otomatik yayın / review oranı, düzeltme ve geri çekme sayısı,
 * numericGroundingCheck red sayısı, abone sayıları. Günlük satır `metrics_daily`'ye yazılır; admin panosu son günleri gösterir.
 */
import { and, count, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { articles, articleVersions, jobFailures, metricsDaily, newsletterSubscribers, pushSubscriptions, rawEvents, reviewQueue, type Db } from "@kaynak/db";

export interface DailyMetrics {
  date: string;
  timeToPublishP50: number | null; // dakika
  timeToPublishP95: number | null;
  published: number;      // o gün yayınlanan (insan onaylılar dahil)
  autoPublished: number;  // insan dokunmadan yayınlanan
  reviewed: number;       // review kuyruğuna düşen
  rejected: number;
  groundingRejects: number;
  skipped: number;        // isNews=false
  corrections: number;
  retracted: number;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]! * 10) / 10;
}

/** Türkiye günü [00:00, 24:00) aralığı için ölçütleri hesaplar; yazmaz. */
export async function computeDailyMetrics(db: Db, isoDate: string): Promise<DailyMetrics> {
  const start = new Date(`${isoDate}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const day = (col: typeof articles.createdAt) => and(gte(col, start), lt(col, end));

  // Kaynaktan yayına süre: raw_events.publishedAt (kaynağın yayın anı) → articles.publishedAt; yalnızca otomatik yayınlar (insan gecikmesi hariç)
  const pubRows = await db.select({ src: rawEvents.publishedAt, pub: articles.publishedAt, id: articles.id })
    .from(articles).leftJoin(rawEvents, eq(rawEvents.id, articles.rawEventId))
    .where(and(isNotNull(articles.publishedAt), gte(articles.publishedAt, start), lt(articles.publishedAt, end)));
  const reviewedIds = new Set((await db.select({ id: reviewQueue.articleId }).from(reviewQueue)).map((r) => r.id));
  const auto = pubRows.filter((r) => !reviewedIds.has(r.id));
  const minutes = auto.filter((r) => r.src).map((r) => Math.max(0, (r.pub!.getTime() - r.src!.getTime()) / 60_000)).sort((a, b) => a - b);

  const [rev] = await db.select({ n: count() }).from(reviewQueue).where(and(gte(reviewQueue.createdAt, start), lt(reviewQueue.createdAt, end)));
  const rejectedRows = await db.select({ note: articles.editorNote }).from(articles).where(and(eq(articles.status, "rejected"), day(articles.createdAt)));
  const [skipped] = await db.select({ n: count() }).from(rawEvents).where(and(eq(rawEvents.status, "skipped"), gte(rawEvents.createdAt, start), lt(rawEvents.createdAt, end)));
  const versions = await db.select({ reason: articleVersions.reason }).from(articleVersions).where(and(gte(articleVersions.createdAt, start), lt(articleVersions.createdAt, end)));

  return {
    date: isoDate,
    timeToPublishP50: percentile(minutes, 50), timeToPublishP95: percentile(minutes, 95),
    published: pubRows.length, autoPublished: auto.length, reviewed: rev?.n ?? 0,
    rejected: rejectedRows.length, groundingRejects: rejectedRows.filter((r) => /numericGroundingCheck/.test(r.note ?? "")).length,
    skipped: skipped?.n ?? 0,
    corrections: versions.filter((v) => v.reason.startsWith("düzeltme")).length,
    retracted: versions.filter((v) => v.reason.startsWith("geri çekme")).length,
  };
}

/** Hesaplayıp metrics_daily'ye yazar (upsert). */
export async function persistDailyMetrics(db: Db, isoDate: string): Promise<DailyMetrics> {
  const m = await computeDailyMetrics(db, isoDate);
  const row = { date: m.date, timeToPublishP50: m.timeToPublishP50, timeToPublishP95: m.timeToPublishP95, published: m.published, reviewed: m.reviewed, rejected: m.rejected, corrections: m.corrections, retracted: m.retracted, autoPublished: m.autoPublished, groundingRejects: m.groundingRejects, skipped: m.skipped, computedAt: new Date() };
  await db.insert(metricsDaily).values(row).onConflictDoUpdate({ target: metricsDaily.date, set: row });
  return m;
}

/** Pano özeti: açık işler ve abone sayıları. */
export async function dashboardCounts(db: Db) {
  const [q] = await db.select({ n: count() }).from(reviewQueue).where(isNull(reviewQueue.resolvedAt));
  const [f] = await db.select({ n: count() }).from(jobFailures).where(isNull(jobFailures.resolvedAt));
  const [pub] = await db.select({ n: count() }).from(articles).where(eq(articles.status, "published"));
  const [push] = await db.select({ n: count() }).from(pushSubscriptions);
  const [nl] = await db.select({ n: count() }).from(newsletterSubscribers).where(and(isNotNull(newsletterSubscribers.confirmedAt), isNull(newsletterSubscribers.unsubscribedAt)));
  const [pending] = await db.select({ n: count() }).from(rawEvents).where(eq(rawEvents.status, "new"));
  const [corr] = await db.select({ n: sql<number>`count(*)::int` }).from(articles).where(eq(articles.status, "corrected"));
  return { openReviews: q?.n ?? 0, openFailures: f?.n ?? 0, published: pub?.n ?? 0, pushSubscribers: push?.n ?? 0, newsletterSubscribers: nl?.n ?? 0, pendingEvents: pending?.n ?? 0, corrected: corr?.n ?? 0 };
}
