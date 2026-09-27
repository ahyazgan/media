import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { articles, documents, rawEvents, type Article } from "@kaynak/db";
import { getDb } from "./db";

export async function latestArticles(limit = 20, category?: string): Promise<Article[]> {
  const { db } = await getDb();
  const where = category
    ? and(eq(articles.status, "published"), eq(articles.category, category as Article["category"]))
    : eq(articles.status, "published");
  return db.select().from(articles).where(where).orderBy(desc(articles.importance), desc(articles.publishedAt)).limit(limit);
}

export async function articleBySlug(slug: string) {
  const { db } = await getDb();
  const [a] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);
  if (!a || (a.status !== "published" && a.status !== "corrected" && a.status !== "retracted")) return null;
  const doc = a.documentId ? (await db.select().from(documents).where(eq(documents.id, a.documentId)).limit(1))[0] : undefined;
  const ev = a.rawEventId ? (await db.select().from(rawEvents).where(eq(rawEvents.id, a.rawEventId)).limit(1))[0] : undefined;
  return { article: a, document: doc, event: ev };
}

export async function relatedArticles(a: Article, limit = 5): Promise<Article[]> {
  const { db } = await getDb();
  return db.select().from(articles)
    .where(and(eq(articles.status, "published"), eq(articles.category, a.category), sql`${articles.id} <> ${a.id}`))
    .orderBy(desc(articles.publishedAt)).limit(limit);
}

export interface GazetteRow {
  externalId: string; title: string; url: string; section: string; sectionLabel: string; issueNo?: number;
  articleSlug: string | null; status: string | null;
}

/** Günün Resmi Gazete maddeleri (isNews=false dahil) + varsa bağlı haber. */
export async function gazetteForDate(isoDate: string): Promise<GazetteRow[]> {
  const { db } = await getDb();
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const rows = await db.select({
    externalId: rawEvents.externalId, title: rawEvents.title, url: rawEvents.url, payload: rawEvents.payload,
    articleSlug: articles.slug, status: articles.status,
  }).from(rawEvents)
    .leftJoin(articles, eq(articles.rawEventId, rawEvents.id))
    .where(and(eq(rawEvents.sourceId, "resmi-gazete"), gte(rawEvents.publishedAt, start), lt(rawEvents.publishedAt, end)))
    .orderBy(rawEvents.externalId);
  return rows.map((r) => {
    const p = r.payload as { section?: string; sectionLabel?: string; issueNo?: number };
    return { externalId: r.externalId, title: r.title, url: r.url, section: p.section ?? "diger", sectionLabel: prettySection(p.section, p.sectionLabel), issueNo: p.issueNo, articleSlug: r.articleSlug, status: r.status };
  });
}

/** Kayıtlı en son Resmi Gazete günü (bugün henüz yoksa ana sayfada onu göstermek için). */
export async function latestGazetteDate(): Promise<string | null> {
  const { db } = await getDb();
  const [r] = await db.select({ d: rawEvents.publishedAt }).from(rawEvents).where(eq(rawEvents.sourceId, "resmi-gazete")).orderBy(desc(rawEvents.publishedAt)).limit(1);
  return r ? r.d.toISOString().slice(0, 10) : null;
}

const SECTION_TR: Record<string, string> = {
  kanun: "Kanunlar", "cb-karari": "Cumhurbaşkanı Kararları", yonetmelik: "Yönetmelikler", teblig: "Tebliğler",
  "kurul-karari": "Kurul Kararları", genelge: "Genelgeler", yargi: "Yargı Bölümü", duzeltme: "Düzeltmeler", ilan: "İlânlar", diger: "Diğer",
};
function prettySection(slug?: string, raw?: string) { return (slug && SECTION_TR[slug]) ?? raw ?? "Diğer"; }
