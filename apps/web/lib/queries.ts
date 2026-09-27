import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { articles, companies, companyEvents, documents, rawEvents, type Article } from "@kaynak/db";
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

// ---------------------------------------------------------------------------
// Faz 2 — KAP akışı ve şirket profili
// ---------------------------------------------------------------------------

export interface KapFeedRow {
  id: string; publishedAt: string; code: string; company: string; title: string; href: string; isNews: boolean; status: string | null;
}

/** Son KAP bildirimleri (isNews=false dahil), her satır tek şirket koduyla; haberleşmişse haber linki. */
export async function kapFeed(limit = 20): Promise<KapFeedRow[]> {
  const { db } = await getDb();
  const rows = await db.select({
    id: rawEvents.id, externalId: rawEvents.externalId, publishedAt: rawEvents.publishedAt, payload: rawEvents.payload, url: rawEvents.url,
    evStatus: rawEvents.status, articleSlug: articles.slug, articleStatus: articles.status, articleTitle: articles.title,
  }).from(rawEvents)
    .leftJoin(articles, eq(articles.rawEventId, rawEvents.id))
    .where(eq(rawEvents.sourceId, "kap"))
    .orderBy(desc(rawEvents.publishedAt), desc(rawEvents.externalId)).limit(limit);
  return rows.map((r) => {
    const p = r.payload as { stockCodes?: string[]; companyName?: string; subject?: string };
    const published = r.articleStatus === "published" || r.articleStatus === "corrected";
    return {
      id: r.id, publishedAt: r.publishedAt.toISOString(),
      code: p.stockCodes?.[0] ?? "—", company: p.companyName ?? "",
      title: published && r.articleTitle ? r.articleTitle : (p.subject ?? "Bildirim"),
      href: published && r.articleSlug ? `/haber/${r.articleSlug}` : r.url,
      isNews: r.evStatus !== "skipped" && Boolean(r.articleSlug), status: r.articleStatus,
    };
  });
}

export async function companyByCode(code: string) {
  const { db } = await getDb();
  const [c] = await db.select().from(companies).where(eq(companies.kapCode, code.toUpperCase())).limit(1);
  return c ?? null;
}

export interface CompanyTimelineRow {
  id: string; publishedAt: Date; title: string; subject: string; classLabel: string; url: string; isNews: boolean;
  articleSlug: string | null; articleTitle: string | null; articleStatus: string | null;
}

/** Şirketin bildirim geçmişi (isNews=false dahil) — şartname §5.1. */
export async function companyTimeline(code: string, limit = 100): Promise<CompanyTimelineRow[]> {
  const { db } = await getDb();
  const rows = await db.select({
    id: companyEvents.id, isNews: companyEvents.isNews, publishedAt: rawEvents.publishedAt, title: rawEvents.title, url: rawEvents.url, payload: rawEvents.payload,
    articleSlug: articles.slug, articleTitle: articles.title, articleStatus: articles.status,
  }).from(companyEvents)
    .innerJoin(rawEvents, eq(rawEvents.id, companyEvents.rawEventId))
    .leftJoin(articles, eq(articles.id, companyEvents.articleId))
    .where(eq(companyEvents.kapCode, code.toUpperCase()))
    .orderBy(desc(rawEvents.publishedAt)).limit(limit);
  return rows.map((r) => {
    const p = r.payload as { subject?: string; sectionLabel?: string };
    return { id: r.id, publishedAt: r.publishedAt, title: r.title, subject: p.subject ?? r.title, classLabel: p.sectionLabel ?? "Bildirim", url: r.url, isNews: r.isNews, articleSlug: r.articleSlug, articleTitle: r.articleTitle, articleStatus: r.articleStatus };
  });
}

/** Şirketle ilgili yayınlanmış haberler (tickers dizisi kodu içerir). */
export async function articlesForCompany(code: string, limit = 30): Promise<Article[]> {
  const { db } = await getDb();
  return db.select().from(articles)
    .where(and(eq(articles.status, "published"), sql`${articles.tickers} @> ARRAY[${code.toUpperCase()}]::text[]`))
    .orderBy(desc(articles.publishedAt)).limit(limit);
}

export interface CompanyIndexRow { kapCode: string; name: string; sector: string | null; disclosureCount: number; newsCount: number; lastDisclosureAt: Date | null }

/** /sirket listesi: bildirim ve haber sayılarıyla, son bildirime göre sıralı. */
export async function companiesIndex(limit = 200): Promise<CompanyIndexRow[]> {
  const { db } = await getDb();
  const rows = await db.select({
    kapCode: companies.kapCode, name: companies.name, sector: companies.sector,
    disclosureCount: sql<number>`count(${companyEvents.id})::int`,
    newsCount: sql<number>`count(${companyEvents.articleId})::int`,
    lastDisclosureAt: sql<Date | null>`max(${rawEvents.publishedAt})`,
  }).from(companies)
    .leftJoin(companyEvents, eq(companyEvents.kapCode, companies.kapCode))
    .leftJoin(rawEvents, eq(rawEvents.id, companyEvents.rawEventId))
    .groupBy(companies.kapCode, companies.name, companies.sector)
    .orderBy(sql`max(${rawEvents.publishedAt}) desc nulls last`, companies.kapCode).limit(limit);
  return rows.map((r) => ({ ...r, lastDisclosureAt: r.lastDisclosureAt ? new Date(r.lastDisclosureAt) : null }));
}

export async function companiesByCodes(codes: string[]) {
  if (!codes.length) return [];
  const { db } = await getDb();
  return db.select().from(companies).where(inArray(companies.kapCode, codes.map((c) => c.toUpperCase())));
}
