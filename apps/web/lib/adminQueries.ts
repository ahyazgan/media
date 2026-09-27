import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { articles, articleVersions, correctionRequests, documents, jobFailures, metricsDaily, rawEvents, reviewQueue, type Article } from "@kaynak/db";
import { computeDailyMetrics, dashboardCounts } from "@kaynak/pipeline/metrics";
import { istanbulDate } from "@kaynak/pipeline";
import { getDb } from "./db";

export async function adminDashboard() {
  const { db } = await getDb();
  const [counts, today, recent] = await Promise.all([
    dashboardCounts(db),
    computeDailyMetrics(db, istanbulDate(new Date())),
    db.select().from(metricsDaily).orderBy(desc(metricsDaily.date)).limit(14),
  ]);
  return { counts, today, recent };
}

export interface ReviewRow { queueId: string; reason: string; createdAt: Date; article: Article; sourceId: string | null }

export async function reviewList(limit = 100): Promise<ReviewRow[]> {
  const { db } = await getDb();
  const rows = await db.select({ queueId: reviewQueue.id, reason: reviewQueue.reason, createdAt: reviewQueue.createdAt, article: articles, sourceId: rawEvents.sourceId })
    .from(reviewQueue).innerJoin(articles, eq(articles.id, reviewQueue.articleId)).leftJoin(rawEvents, eq(rawEvents.id, articles.rawEventId))
    .where(isNull(reviewQueue.resolvedAt)).orderBy(desc(articles.importance), asc(reviewQueue.createdAt)).limit(limit);
  return rows;
}

export async function articleForAdmin(id: string) {
  const { db } = await getDb();
  const [a] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!a) return null;
  const [doc] = a.documentId ? await db.select().from(documents).where(eq(documents.id, a.documentId)).limit(1) : [];
  const [ev] = a.rawEventId ? await db.select().from(rawEvents).where(eq(rawEvents.id, a.rawEventId)).limit(1) : [];
  const [queue] = await db.select().from(reviewQueue).where(and(eq(reviewQueue.articleId, a.id), isNull(reviewQueue.resolvedAt))).limit(1);
  const versions = await db.select().from(articleVersions).where(eq(articleVersions.articleId, a.id)).orderBy(desc(articleVersions.version));
  return { article: a, document: doc, event: ev, queue, versions };
}

/** Düzeltme için canlı (published/corrected) makaleler; q verilirse başlık/slug araması. */
export async function liveArticles(q = "", limit = 50): Promise<Article[]> {
  const { db } = await getDb();
  const live = inArray(articles.status, ["published", "corrected"]);
  const term = q.trim().replace(/[%_]/g, " ");
  const where = term ? and(live, or(ilike(articles.title, `%${term}%`), ilike(articles.slug, `%${term}%`))) : live;
  return db.select().from(articles).where(where).orderBy(desc(articles.publishedAt)).limit(limit);
}

export async function openRequests(limit = 200) {
  const { db } = await getDb();
  return db.select().from(correctionRequests).orderBy(asc(correctionRequests.resolvedAt), desc(correctionRequests.createdAt)).limit(limit);
}

export async function failures(limit = 200) {
  const { db } = await getDb();
  return db.select({ f: jobFailures, title: rawEvents.title, externalId: rawEvents.externalId, url: rawEvents.url })
    .from(jobFailures).leftJoin(rawEvents, eq(rawEvents.id, jobFailures.rawEventId))
    .orderBy(asc(jobFailures.resolvedAt), desc(jobFailures.failedAt)).limit(limit);
}
