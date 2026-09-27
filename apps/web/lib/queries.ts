import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { articles, articleVersions, calendarEvents, companies, companyEvents, documents, rawEvents, type Article } from "@kaynak/db";
import { tickerItems } from "@kaynak/pipeline/market";
import { getDb } from "./db";

/** Sitede görünen durumlar: düzeltilmiş haber de yayındadır (notuyla). Geri çekilenler yalnızca doğrudan bağlantıyla açılır. */
export const LIVE = ["published", "corrected"] as const;
const live = () => inArray(articles.status, [...LIVE]);
export const isLive = (s: string | null | undefined) => s === "published" || s === "corrected";

export async function latestArticles(limit = 20, category?: string): Promise<Article[]> {
  const { db } = await getDb();
  const where = category ? and(live(), eq(articles.category, category as Article["category"])) : live();
  return db.select().from(articles).where(where).orderBy(desc(articles.importance), desc(articles.publishedAt)).limit(limit);
}

export async function articleBySlug(slug: string) {
  const { db } = await getDb();
  const [a] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);
  if (!a || (a.status !== "published" && a.status !== "corrected" && a.status !== "retracted")) return null;
  const doc = a.documentId ? (await db.select().from(documents).where(eq(documents.id, a.documentId)).limit(1))[0] : undefined;
  const ev = a.rawEventId ? (await db.select().from(rawEvents).where(eq(rawEvents.id, a.rawEventId)).limit(1))[0] : undefined;
  // Düzeltme geçmişi: ilk yayın sürümü hariç, yeniden eskiye (şartname Faz 4 kabul: "Düzeltildi" notu ve geçmiş)
  const versions = a.status === "corrected" || a.status === "retracted"
    ? (await db.select().from(articleVersions).where(eq(articleVersions.articleId, a.id)).orderBy(desc(articleVersions.version))).filter((v) => v.version > 1) // v1 her zaman ilk yayın hâlidir
    : [];
  return { article: a, document: doc, event: ev, versions };
}

export async function relatedArticles(a: Article, limit = 5): Promise<Article[]> {
  const { db } = await getDb();
  return db.select().from(articles)
    .where(and(live(), eq(articles.category, a.category), sql`${articles.id} <> ${a.id}`))
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
    .where(and(live(), sql`${articles.tickers} @> ARRAY[${code.toUpperCase()}]::text[]`))
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

// ---------------------------------------------------------------------------
// Faz 3 — makro takvim, RSS, arama
// ---------------------------------------------------------------------------

export interface CalendarRow { id: string; scheduledAt: string; institution: string; title: string; articleHref: string | null; sourceUrl: string | null }

/** Önümüzdeki `days` günün takvimi; yayınlanmış haber varsa bağlantısıyla. Bugün açıklananlar (son 3 saat) listede kalır. */
export async function calendarUpcoming(days = 30, limit = 200, from = new Date()): Promise<CalendarRow[]> {
  const { db } = await getDb();
  const start = new Date(from.getTime() - 3 * 3_600_000);
  const end = new Date(from.getTime() + days * 86_400_000);
  const rows = await db.select({ id: calendarEvents.id, scheduledAt: calendarEvents.scheduledAt, institution: calendarEvents.institution, title: calendarEvents.title, sourceUrl: calendarEvents.sourceUrl, slug: articles.slug, status: articles.status })
    .from(calendarEvents).leftJoin(articles, eq(articles.id, calendarEvents.articleId))
    .where(and(gte(calendarEvents.scheduledAt, start), lt(calendarEvents.scheduledAt, end)))
    .orderBy(asc(calendarEvents.scheduledAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, scheduledAt: r.scheduledAt.toISOString(), institution: r.institution, title: r.title, sourceUrl: r.sourceUrl, articleHref: r.slug && isLive(r.status) ? `/haber/${r.slug}` : null }));
}

/** RSS için son yayınlanan haberler (yayın tarihine göre). */
export async function recentArticles(limit = 50): Promise<Article[]> {
  const { db } = await getDb();
  return db.select().from(articles).where(live()).orderBy(desc(articles.publishedAt)).limit(limit);
}

/** Google News sitemap: son 48 saatte yayınlananlar (şartname §8). */
export async function newsSitemapArticles(): Promise<Article[]> {
  const { db } = await getDb();
  return db.select().from(articles).where(and(live(), gte(articles.publishedAt, new Date(Date.now() - 48 * 3_600_000)))).orderBy(desc(articles.publishedAt)).limit(1000);
}

/** sitemap.xml verisi: tüm canlı haberler, şirketler ve Resmi Gazete günleri. */
export async function sitemapData() {
  const { db } = await getDb();
  const arts = await db.select({ slug: articles.slug, updatedAt: articles.updatedAt }).from(articles).where(live()).orderBy(desc(articles.publishedAt)).limit(45_000);
  const cos = await db.select({ kapCode: companies.kapCode, updatedAt: companies.updatedAt }).from(companies);
  const days = await db.select({ d: sql<string>`to_char(${rawEvents.publishedAt} at time zone 'Europe/Istanbul', 'YYYY-MM-DD')` }).from(rawEvents)
    .where(eq(rawEvents.sourceId, "resmi-gazete")).groupBy(sql`1`).orderBy(sql`1 desc`).limit(2000);
  return { articles: arts, companies: cos, gazetteDays: days.map((r) => r.d) };
}

/** Basit başlık/dek araması (PWA share_target buraya düşer). */
export async function searchArticles(q: string, limit = 30): Promise<Article[]> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const { db } = await getDb();
  const like = `%${term.replace(/[%_]/g, " ")}%`;
  return db.select().from(articles)
    .where(and(live(), or(ilike(articles.title, like), ilike(articles.dek, like))))
    .orderBy(desc(articles.publishedAt)).limit(limit);
}

/** Son dakika (ana sayfa barı): son `hours` saat içinde yayınlanmış en yeni importance ≥ 5 haber. */
export async function breakingArticle(hours = 3): Promise<Article | null> {
  const { db } = await getDb();
  const [a] = await db.select().from(articles)
    .where(and(live(), gte(articles.importance, 5), gte(articles.publishedAt, new Date(Date.now() - hours * 3_600_000))))
    .orderBy(desc(articles.publishedAt)).limit(1);
  return a ?? null;
}

/** Piyasa şeridi (TCMB EVDS kurları); veri yoksa boş → şerit gizlenir. */
export async function marketTicker() {
  const { db } = await getDb();
  return tickerItems(db);
}
