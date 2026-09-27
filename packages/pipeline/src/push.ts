import { eq, or, sql } from "drizzle-orm";
import { pushSubscriptions, type Article, type Db } from "@kaynak/db";
import type { Env } from "./env.js";

export interface PushSender {
  sendNotification(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string): Promise<unknown>;
}

export const vapidConfigured = (env: Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY">) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

/** web-push kütüphanesini VAPID ile hazırlar; anahtar yoksa undefined. */
export async function createPushSender(env: Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT" | "BOT_CONTACT_EMAIL">): Promise<PushSender | undefined> {
  if (!vapidConfigured(env)) return undefined;
  const { default: webpush } = await import("web-push");
  webpush.setVapidDetails(env.VAPID_SUBJECT ?? `mailto:${env.BOT_CONTACT_EMAIL ?? "iletisim@example.com"}`, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  return { sendNotification: (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "high" }) };
}

export function pushPayload(a: Article, siteUrl: string): string {
  return JSON.stringify({ title: a.title, body: a.dek, url: `${siteUrl}/haber/${a.slug}`, tag: `haber-${a.id}`, category: a.category });
}

/**
 * Şartname §5.5: importance >= 4 → kategori aboneliğine göre web push. Kategori listesi boş olan abone her şeyi alır.
 * 404/410 dönen abonelikler silinir; diğer hatalar loglanır, gönderim sürer.
 */
export async function sendPushForArticle(db: Db, sender: PushSender, a: Article, siteUrl: string, log?: (m: string, meta?: Record<string, unknown>) => void) {
  const subs = await db.select().from(pushSubscriptions)
    .where(or(sql`cardinality(${pushSubscriptions.categories}) = 0`, sql`${pushSubscriptions.categories} @> ARRAY[${a.category}]::text[]`));
  const payload = pushPayload(a, siteUrl);
  let sent = 0, removed = 0, failed = 0;
  for (const s of subs) {
    try { await sender.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload); sent++; }
    catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) { await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)); removed++; }
      else { failed++; log?.("push:fail", { endpoint: s.endpoint.slice(0, 40), error: (e as Error).message }); }
    }
  }
  log?.("push", { article: a.slug, candidates: subs.length, sent, removed, failed });
  return { sent, removed, failed };
}
