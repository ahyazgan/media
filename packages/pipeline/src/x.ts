/**
 * X (Twitter) paylaşımı — şartname §8: yalnızca resmi hesap, günde en fazla 30 gönderi, bot ağı yok.
 * Gönderi: başlık + link (t.co 23 karakter sayılır, 280 sınırı). Her yayın için tek gönderi (distribution_log ile tekrar önlenir).
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { distributionLog, type Article, type Db } from "@kaynak/db";
import type { Env } from "./env.js";
import { authorizationHeader, type OAuth1Credentials } from "./oauth1.js";

export const X_API = "https://api.x.com/2/tweets";
const TCO_LEN = 23;

export function xConfigured(env: Pick<Env, "X_CONSUMER_KEY" | "X_CONSUMER_SECRET" | "X_ACCESS_TOKEN" | "X_ACCESS_SECRET">): OAuth1Credentials | undefined {
  if (!env.X_CONSUMER_KEY || !env.X_CONSUMER_SECRET || !env.X_ACCESS_TOKEN || !env.X_ACCESS_SECRET) return undefined;
  return { consumerKey: env.X_CONSUMER_KEY, consumerSecret: env.X_CONSUMER_SECRET, accessToken: env.X_ACCESS_TOKEN, accessSecret: env.X_ACCESS_SECRET };
}

/** Gönderi metni: başlık (gerekirse kısaltılır) + boşluk + link ≤ 280. */
export function composeTweet(a: Pick<Article, "title" | "dek" | "slug">, siteUrl: string): string {
  const url = `${siteUrl}/haber/${a.slug}`;
  const room = 280 - TCO_LEN - 1;
  let text = a.title;
  const withDek = `${a.title}\n${a.dek}`;
  if (withDek.length <= room) text = withDek;
  else if (text.length > room) text = text.slice(0, room - 1).replace(/\s+\S*$/, "") + "…";
  return `${text}\n${url}`;
}

/** Türkiye gününün başlangıcı (UTC) — günlük sınır bu günden sayılır. */
export function istanbulDayStart(now = new Date()): Date {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return new Date(`${g("year")}-${g("month")}-${g("day")}T00:00:00+03:00`);
}

export async function xPostedToday(db: Db, now = new Date()): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(distributionLog)
    .where(and(eq(distributionLog.channel, "x"), eq(distributionLog.status, "ok"), gte(distributionLog.createdAt, istanbulDayStart(now))));
  return r?.n ?? 0;
}

export interface XPostResult { status: "ok" | "failed" | "skipped"; id?: string; detail?: string }

/**
 * Yayınlanan haberi X'e gönderir. Atlama nedenleri: anahtar yok, önem eşiği altı, günlük sınır, daha önce gönderilmiş.
 * Sonuç her durumda distribution_log'a yazılır; hata pipeline'ı düşürmez.
 */
export async function postArticleToX(db: Db, env: Env, a: Article, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<XPostResult> {
  const creds = xConfigured(env);
  const log = async (r: XPostResult) => { await db.insert(distributionLog).values({ channel: "x", articleId: a.id, status: r.status, externalId: r.id ?? null, detail: r.detail ?? null }); return r; };
  if (!creds) return { status: "skipped", detail: "X anahtarları tanımlı değil" };
  if (a.importance < env.X_MIN_IMPORTANCE) return log({ status: "skipped", detail: `önem ${a.importance} < eşik ${env.X_MIN_IMPORTANCE}` });
  const [dup] = await db.select({ id: distributionLog.id }).from(distributionLog).where(and(eq(distributionLog.channel, "x"), eq(distributionLog.articleId, a.id), eq(distributionLog.status, "ok"))).limit(1);
  if (dup) return { status: "skipped", detail: "daha önce gönderildi" };
  const n = await xPostedToday(db, now);
  if (n >= env.X_MAX_PER_DAY) return log({ status: "skipped", detail: `günlük sınır ${env.X_MAX_PER_DAY} doldu` });
  const text = composeTweet(a, env.SITE_URL);
  try {
    const res = await fetchImpl(X_API, {
      method: "POST",
      headers: { authorization: authorizationHeader(creds, "POST", X_API), "content-type": "application/json", "user-agent": "KaynakBot/1.0" },
      body: JSON.stringify({ text }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; detail?: string; title?: string };
    if (!res.ok || !body.data?.id) return log({ status: "failed", detail: `HTTP ${res.status}: ${body.detail ?? body.title ?? "yanıt anlaşılamadı"}`.slice(0, 500) });
    return log({ status: "ok", id: body.data.id });
  } catch (e) { return log({ status: "failed", detail: (e as Error).message.slice(0, 500) }); }
}
