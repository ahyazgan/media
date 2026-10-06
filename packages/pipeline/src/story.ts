import { and, arrayOverlaps, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { type Db, articles, documents, rawEvents, stories } from "@kaynak/db";
import type { BackgroundItem } from "@kaynak/agents";

/**
 * Konu dizileri: aynı olayın gelişmelerini birbirine bağlar ve yazara arka plan verir.
 * Önce kural (dizi anahtarı, KAP'ın "daha önce yapılan açıklamanın tarihi" alanı), kural yetmezse aynı şirketin son haberleri
 * arasından model seçer (Agents.relate). Her gelişme kendi belgesine dayanan ayrı haber olarak kalır.
 */

const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
export function keySlug(s: string): string {
  return s.toLocaleLowerCase("tr").replace(/[çğıöşüâîû]/g, (c) => TR[c] ?? c)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * KAP: süreç ya da dönemsel seri olan konular (aynı şirketin bu konudaki bildirimleri tek dizi). "Özel Durum Açıklaması (Genel)",
 * "Yeni İş İlişkisi", "İhale Süreci" gibi konularda her bildirim ayrı olay olabilir: onlar modele bırakılır.
 */
const KAP_THREADS: [RegExp, string][] = [
  [/payların geri alınması/i, "pay-geri-alim"],
  [/sermaye artırımı|sermaye azaltımı|azaltımı işlemleri/i, "sermaye"],
  [/k[aâ]r payı/i, "kar-payi"],
  [/genel kurul/i, "genel-kurul"],
  [/birleşme|ayrılma hakkı/i, "birlesme"],
  [/bölünme/i, "bolunme"],
  [/pay alım teklifi/i, "pay-alim-teklifi"],
  [/finansal rapor|faaliyet raporu/i, "finansal-rapor"],
  [/kredi derecelendirme/i, "derecelendirme"],
  [/pay alım satım bildirimi/i, "pay-alim-satim"],
  [/ihraç tavanı/i, "ihrac-tavani"],
];

// \b Türkçe harfleri tanımaz ("Eylül", "Şubat"): harf sınırı açıkça
const MONTHS_RE = /(?<!\p{L})(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)(?!\p{L})/giu;

/** TÜİK "Tüketici Fiyat Endeksi, Eylül 2026" / TCMB "Faiz Oranlarına İlişkin Basın Duyurusu (2026-38)" → dönemsiz seri adı */
export function seriesName(sourceId: string, title: string): string | undefined {
  let s = title.replace(/\([^)]*\d[^)]*\)/g, " ");
  if (sourceId === "tuik") s = s.split(",")[0] ?? s;
  s = s.replace(/(?<!\p{L})[IVX]+\.\s*çeyrek(?!\p{L})/giu, " ").replace(MONTHS_RE, " ").replace(/\d+/g, " ").replace(/[-–:]\s*$/u, " ");
  const slug = keySlug(s);
  return slug.length >= 6 ? slug : undefined;
}

const AMEND_RE = /\s+(?:Bazı\s+Maddelerinin\s+)?(?:Değişiklik\s+Yapılmasına|Değiştirilmesine|Yürürlükten\s+Kaldırılmasına)\s+(?:Dair|İlişkin)\b.*$/iu;

/**
 * Mevzuat: değişiklik başlığından asıl düzenlemenin adı. "X Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik" → "X Yönetmeliği";
 * "X Hakkında Yönetmelikte …" → "X Hakkında Yönetmelik"; "X Tebliği (Seri No: 5)'nde …" → "X Tebliği (Seri No: 5)". Asıl düzenlemenin
 * kendi başlığı aynı anahtarı verir; Resmi Gazete ile kurumun kendi duyurusu da aynı diziye düşer.
 */
export function regulationBase(title: string): string | undefined {
  let base = title.trim().replace(AMEND_RE, "");
  base = base
    .replace(/(Yönetmeliğ|Tebliğ)(?:inde|inin)$/u, "$1i")
    .replace(/(Yönetmelik|Tebliğ)(?:te|de|in)$/u, "$1")
    .replace(/\)\s*['’]?\s*n?(?:d[ae]|in|ın)$/u, ")");
  if (!/(?:Yönetmeliği|Yönetmelik|Tebliği|Tebliğ|Tebliği\s*\([^)]*\))$/u.test(base)) return undefined;
  const slug = keySlug(base);
  return slug.length >= 8 ? slug : undefined;
}

/** Kural anahtarı: aynı anahtarlı son dizi süre sınırı içindeyse yeni haber o diziye girer. */
export function threadKey(sourceId: string, title: string, payload: Record<string, unknown>): string | undefined {
  if (sourceId === "kap") {
    const codes = Array.isArray(payload["stockCodes"]) ? (payload["stockCodes"] as unknown[]).map(String) : [];
    const subject = String(payload["subject"] ?? "");
    const hit = KAP_THREADS.find(([re]) => re.test(subject));
    return hit && codes[0] ? `kap:${codes[0]}:${hit[1]}` : undefined;
  }
  if (sourceId === "tuik" || sourceId === "tcmb") {
    const s = seriesName(sourceId, title);
    return s ? `${sourceId}:${s}` : undefined;
  }
  const reg = regulationBase(title);
  return reg ? `mevzuat:${reg}` : undefined;
}

/** Anahtar eşleşmesinin süre sınırı (son gelişmeden bu yana) */
export function windowDays(key: string): number {
  if (key.startsWith("kap:")) return 180;
  if (key.startsWith("mevzuat:")) return 5 * 365;
  return 800; // TÜİK/TCMB serileri: bir yıl ara verse de aynı seri
}

/** KAP bildirim formu: "Konuya İlişkin Daha Önce Yapılan Açıklamanın Tarihi | 12.09.2026" → "2026-09-12" */
export function priorDisclosureDate(text: string): string | undefined {
  // Ayırıcı: "|" (PDF tablosu), ":" (sayfa metni) ya da hiç (eski çıkarımda bitişik "Tarihi12.09.2026")
  const m = /Konuya\s+İlişkin\s+Daha\s+Önce\s+Yapılan\s+Açıklamanın\s+Tarihi\s*[|:]?\s*(\d{2})[./](\d{2})[./](\d{4})/u.exec(text);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
export const trDate = (d: Date) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" }).format(d);

export interface StoryCandidate {
  articleId: string;
  storyId: string | null;
  title: string;
  dek: string;
  /** Kaynak belgenin yayın zamanı */
  eventAt: Date;
}

/** Dizi kararı: var olan diziye gir, bir aday haberle yeni dizi kur ya da (yalnızca anahtarla) yeni dizi başlat */
export interface StoryPlan {
  key?: string;
  storyId?: string;
  joinArticle?: StoryCandidate;
  /** Kural yetmedi: model bu adaylar arasından seçecek (Agents.relate) */
  candidates: StoryCandidate[];
  via?: "key" | "prior-date" | "model";
}

const VISIBLE = ["published", "corrected"] as const;
const DAY = 86_400_000;

/** Kuralla dizi bulur; bulamazsa aynı şirketin son haberlerini model için aday listesi olarak döndürür. */
export async function planStory(db: Db, p: { sourceId: string; title: string; payload: Record<string, unknown>; rawEventId: string; publishedAt: Date; stockCodes: string[]; text: string }): Promise<StoryPlan> {
  const key = threadKey(p.sourceId, p.title, p.payload);
  if (key) {
    const since = new Date(p.publishedAt.getTime() - windowDays(key) * DAY);
    const [s] = await db.select().from(stories).where(and(eq(stories.key, key), gte(stories.lastAt, since))).orderBy(desc(stories.lastAt)).limit(1);
    if (s) return { key, storyId: s.id, candidates: [], via: "key" };
  }
  if (p.sourceId !== "kap" || !p.stockCodes.length) return { key, candidates: [] };

  const since = new Date(p.publishedAt.getTime() - 180 * DAY);
  const rows = await db.select({
    articleId: articles.id, storyId: articles.storyId, title: articles.title, dek: articles.dek, eventAt: rawEvents.publishedAt,
  }).from(articles).innerJoin(rawEvents, eq(rawEvents.id, articles.rawEventId))
    .where(and(
      arrayOverlaps(articles.tickers, p.stockCodes),
      inArray(articles.status, [...VISIBLE, "review"]),
      ne(articles.rawEventId, p.rawEventId),
      gte(rawEvents.publishedAt, since), lte(rawEvents.publishedAt, p.publishedAt),
    ))
    .orderBy(desc(rawEvents.publishedAt)).limit(8);
  const candidates: StoryCandidate[] = rows;
  // KAP formunun kendi bağlantısı: o gün aynı şirketin tek haberi varsa model sorulmaz; birden çoksa model yalnızca o günün haberleri
  // arasından seçer (tarih tek başına olayı ayırt etmez)
  const prior = priorDisclosureDate(p.text);
  const sameDay = prior ? candidates.filter((c) => istDay(c.eventAt) === prior) : [];
  if (sameDay.length === 1) return { key, joinArticle: sameDay[0], candidates: [], via: "prior-date" };
  return { key, candidates: sameDay.length ? sameDay : candidates };
}

/** Yazara giden arka plan: dizinin yayındaki önceki haberleri (yeniden eskiye, en çok 3); dizi yoksa eşleşen aday haber. */
export async function backgroundFor(db: Db, plan: StoryPlan, excludeRawEventId: string): Promise<BackgroundItem[]> {
  const storyId = plan.storyId ?? plan.joinArticle?.storyId ?? undefined;
  const conds = [
    inArray(articles.status, [...VISIBLE]),
    ne(articles.rawEventId, excludeRawEventId),
    storyId && plan.joinArticle ? or(eq(articles.storyId, storyId), eq(articles.id, plan.joinArticle.articleId)) : storyId ? eq(articles.storyId, storyId) : plan.joinArticle ? eq(articles.id, plan.joinArticle.articleId) : undefined,
  ];
  if (!conds[2]) return [];
  const rows = await db.select({ title: articles.title, dek: articles.dek, keyFacts: articles.keyFacts, eventAt: rawEvents.publishedAt })
    .from(articles).innerJoin(rawEvents, eq(rawEvents.id, articles.rawEventId))
    .where(and(...conds)).orderBy(desc(rawEvents.publishedAt)).limit(3);
  return rows.map((r) => ({ date: trDate(r.eventAt), title: r.title, dek: r.dek, facts: r.keyFacts.slice(0, 3).map((k) => k.text) }));
}

/** Haberi diziye bağlar (gerekirse diziyi kurar); dizi kimliğini döndürür. */
export async function attachStory(db: Db, articleId: string, plan: StoryPlan, eventAt: Date): Promise<string | undefined> {
  let storyId = plan.storyId ?? plan.joinArticle?.storyId ?? undefined;
  if (!storyId && (plan.joinArticle || plan.key)) {
    const firstAt = plan.joinArticle && plan.joinArticle.eventAt < eventAt ? plan.joinArticle.eventAt : eventAt;
    const [s] = await db.insert(stories).values({ key: plan.key ?? null, lastAt: firstAt }).returning();
    storyId = s!.id;
    if (plan.joinArticle) await db.update(articles).set({ storyId }).where(eq(articles.id, plan.joinArticle.articleId));
  }
  if (!storyId) return undefined;
  await db.update(articles).set({ storyId }).where(eq(articles.id, articleId));
  await db.update(stories).set({ lastAt: sql`greatest(${stories.lastAt}, ${eventAt.toISOString()}::timestamptz)` }).where(eq(stories.id, storyId));
  // Model eşleştirmesiyle kurulan diziye ilk anahtarlı gelişme anahtarını verir (sonrakiler kuralla bulunsun)
  if (plan.key) await db.update(stories).set({ key: plan.key }).where(and(eq(stories.id, storyId), isNull(stories.key)));
  return storyId;
}

/**
 * Geriye dönük dizi kurulumu (bir kez; model çağırmaz): dizisiz haberler kaynak yayın sırasıyla kural anahtarı ve KAP'ın önceki
 * açıklama tarihiyle bağlanır. Model eşleştirmesi yalnızca yeni gelen bildirimlerde yapılır. Döndürür: bağlanan haber sayısı.
 */
export async function backfillStories(db: Db): Promise<{ scanned: number; linked: number }> {
  const rows = await db.select({
    id: articles.id, tickers: articles.tickers, rawEventId: rawEvents.id, sourceId: rawEvents.sourceId, title: rawEvents.title,
    payload: rawEvents.payload, publishedAt: rawEvents.publishedAt, text: documents.textContent,
  }).from(articles)
    .innerJoin(rawEvents, eq(rawEvents.id, articles.rawEventId))
    .leftJoin(documents, eq(documents.id, articles.documentId))
    .where(and(isNull(articles.storyId), inArray(articles.status, [...VISIBLE, "review"])))
    .orderBy(rawEvents.publishedAt);
  for (const r of rows) {
    const plan = await planStory(db, { sourceId: r.sourceId, title: r.title, payload: r.payload, rawEventId: r.rawEventId, publishedAt: r.publishedAt, stockCodes: r.tickers, text: r.text ?? "" });
    await attachStory(db, r.id, { ...plan, candidates: [] }, r.publishedAt);
  }
  // Sonradan gelen bir haber önceki haberi de diziye alabilir (yan etki): sayım sonda
  const ids = rows.map((r) => r.id);
  const linked = ids.length ? (await db.select({ id: articles.id }).from(articles).where(and(inArray(articles.id, ids), isNotNull(articles.storyId)))).length : 0;
  return { scanned: rows.length, linked };
}
