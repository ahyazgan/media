/**
 * Editoryal işlemler (admin ve worker ortak): inceleme kuyruğundan yayınlama/reddetme, düzeltme yayınlama, geri çekme,
 * sürüm anlık görüntüleri (article_versions). Şartname §10: hard delete yok; her değişiklik sürüm olarak saklanır.
 * Yalnızca @kaynak/db'ye bağımlıdır (web'de admin server action'ları buradan çağırır).
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { articles, articleVersions, reviewQueue, type Article, type ArticleVersion, type Db } from "@kaynak/db";

export type ArticleSnapshot = Pick<Article, "title" | "dek" | "bodyMarkdown" | "keyFacts" | "tickers" | "tags" | "category" | "importance" | "status" | "sourceUrl" | "editorNote"> & { publishedAt: string | null };

export function snapshotOf(a: Article): ArticleSnapshot {
  return {
    title: a.title, dek: a.dek, bodyMarkdown: a.bodyMarkdown, keyFacts: a.keyFacts, tickers: a.tickers, tags: a.tags,
    category: a.category, importance: a.importance, status: a.status, sourceUrl: a.sourceUrl, editorNote: a.editorNote,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
  };
}

/** Makalenin o anki halini bir sonraki sürüm numarasıyla kaydeder. */
export async function snapshotArticle(db: Db, a: Article, reason: string): Promise<ArticleVersion> {
  const [last] = await db.select({ v: sql<number>`coalesce(max(${articleVersions.version}), 0)::int` }).from(articleVersions).where(eq(articleVersions.articleId, a.id));
  const version = (last?.v ?? 0) + 1;
  const [row] = await db.insert(articleVersions).values({ articleId: a.id, version, snapshot: snapshotOf(a) as unknown as Record<string, unknown>, reason }).returning();
  return row!;
}

export async function versionsOf(db: Db, articleId: string): Promise<ArticleVersion[]> {
  return db.select().from(articleVersions).where(eq(articleVersions.articleId, articleId)).orderBy(desc(articleVersions.version));
}

async function getArticle(db: Db, id: string): Promise<Article> {
  const [a] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!a) throw new Error(`makale yok: ${id}`);
  return a;
}

async function resolveQueue(db: Db, articleId: string, by: string) {
  await db.update(reviewQueue).set({ resolvedAt: new Date(), resolvedBy: by }).where(and(eq(reviewQueue.articleId, articleId), isNull(reviewQueue.resolvedAt)));
}

/** İnceleme kuyruğundaki taslağı yayınlar (isteğe bağlı başlık/dek/gövde düzenlemesiyle). v1 anlık görüntüsü alınır. */
export async function publishFromReview(db: Db, articleId: string, opts: { by: string; patch?: Partial<Pick<Article, "title" | "dek" | "bodyMarkdown">>; note?: string }): Promise<Article> {
  const a = await getArticle(db, articleId);
  if (a.isFlash && a.status === "published") return publishFlashFull(db, a, opts);
  if (a.status !== "review" && a.status !== "draft") throw new Error(`yayınlanamaz: durum ${a.status}`);
  const now = new Date();
  const [updated] = await db.update(articles).set({
    ...(opts.patch ?? {}), status: "published", publishedAt: now, updatedAt: now,
    editorNote: opts.note ?? null,
  }).where(eq(articles.id, articleId)).returning();
  await resolveQueue(db, articleId, opts.by);
  await snapshotArticle(db, updated!, `yayın (insan onayı: ${opts.by})`);
  return updated!;
}

/**
 * Flaş yayındayken tam metnin onayı: bekleyen taslak (yoksa editörün yazdığı) flaşın yerine geçer. Önceki hâl sürüm olarak
 * saklanır; yayın saati flaşınki kalır; dağıtım tekrarlanmaz (çağıran yalnızca sayfaları yeniler).
 */
async function publishFlashFull(db: Db, a: Article, opts: { by: string; patch?: Partial<Pick<Article, "title" | "dek" | "bodyMarkdown">>; note?: string }): Promise<Article> {
  const pd = a.pendingDraft;
  const [updated] = await db.update(articles).set({
    ...(pd ? { title: pd.title, dek: pd.dek, bodyMarkdown: pd.bodyMarkdown, keyFacts: pd.keyFacts, tags: pd.tags, tickers: pd.tickers } : {}),
    ...(opts.patch ?? {}), isFlash: false, pendingDraft: null, updatedAt: new Date(), editorNote: opts.note ?? null,
  }).where(eq(articles.id, a.id)).returning();
  await resolveQueue(db, a.id, opts.by);
  await snapshotArticle(db, updated!, `tam metin flaşın yerine (insan onayı: ${opts.by})`);
  return updated!;
}

/** İnceleme kuyruğundaki taslağı reddeder; kayıt `rejected` olarak kalır (ölçütler için). Flaşta yalnızca bekleyen tam metin atılır. */
export async function rejectFromReview(db: Db, articleId: string, opts: { by: string; reason: string }): Promise<Article> {
  const a = await getArticle(db, articleId);
  if (a.isFlash && a.status === "published") {
    const [kept] = await db.update(articles).set({ pendingDraft: null, updatedAt: new Date(), editorNote: `tam metin reddedildi (${opts.by}): ${opts.reason}; flaş yayında` }).where(eq(articles.id, a.id)).returning();
    await resolveQueue(db, a.id, opts.by);
    return kept!;
  }
  if (a.status !== "review" && a.status !== "draft") throw new Error(`reddedilemez: durum ${a.status}`);
  const [updated] = await db.update(articles).set({ status: "rejected", updatedAt: new Date(), editorNote: `reddedildi (${opts.by}): ${opts.reason}` }).where(eq(articles.id, articleId)).returning();
  await resolveQueue(db, articleId, opts.by);
  return updated!;
}

export interface CorrectionPatch { title?: string; dek?: string; bodyMarkdown?: string; keyFacts?: Article["keyFacts"] }

/**
 * Düzeltme yayınlar: önce mevcut hâl sürüm olarak saklanır, sonra alanlar güncellenir, durum `corrected`,
 * editorNote düzeltme açıklaması olur (haber sayfası "Düzeltildi" notunda gösterir). Değişen alan yoksa hata.
 */
export async function publishCorrection(db: Db, articleId: string, patch: CorrectionPatch, opts: { by: string; reason: string }): Promise<Article> {
  const a = await getArticle(db, articleId);
  if (a.status !== "published" && a.status !== "corrected") throw new Error(`düzeltilemez: durum ${a.status}`);
  const changes: CorrectionPatch = {};
  for (const k of ["title", "dek", "bodyMarkdown"] as const) if (patch[k] !== undefined && patch[k] !== a[k]) changes[k] = patch[k];
  if (patch.keyFacts && JSON.stringify(patch.keyFacts) !== JSON.stringify(a.keyFacts)) changes.keyFacts = patch.keyFacts;
  if (!Object.keys(changes).length) throw new Error("değişiklik yok");
  if (!opts.reason.trim()) throw new Error("düzeltme gerekçesi zorunlu");
  const versions = await versionsOf(db, a.id);
  if (!versions.length) await snapshotArticle(db, a, "ilk yayın (geriye dönük anlık görüntü)");
  const [updated] = await db.update(articles).set({ ...changes, status: "corrected", updatedAt: new Date(), editorNote: opts.reason.trim() }).where(eq(articles.id, articleId)).returning();
  await snapshotArticle(db, updated!, `düzeltme (${opts.by}): ${opts.reason.trim()}`);
  return updated!;
}

/** Geri çekme: içerik silinmez, durum `retracted`; sayfa "Geri çekildi" notuyla kalır. */
export async function retractArticle(db: Db, articleId: string, opts: { by: string; reason: string }): Promise<Article> {
  const a = await getArticle(db, articleId);
  if (a.status !== "published" && a.status !== "corrected") throw new Error(`geri çekilemez: durum ${a.status}`);
  if (!opts.reason.trim()) throw new Error("geri çekme gerekçesi zorunlu");
  const versions = await versionsOf(db, a.id);
  if (!versions.length) await snapshotArticle(db, a, "ilk yayın (geriye dönük anlık görüntü)");
  const [updated] = await db.update(articles).set({ status: "retracted", updatedAt: new Date(), editorNote: opts.reason.trim() }).where(eq(articles.id, articleId)).returning();
  await snapshotArticle(db, updated!, `geri çekme (${opts.by}): ${opts.reason.trim()}`);
  return updated!;
}
