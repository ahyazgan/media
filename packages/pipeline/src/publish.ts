import type { Article } from "@kaynak/db";
import type { Env } from "./env.js";

/** publish sonrası: ISR revalidate, IndexNow (Faz 4), Telegram (Faz 3). Hiçbiri pipeline'ı düşürmez. */
export function makeOnPublished(env: Env, fetchImpl: typeof fetch = fetch) {
  return async (a: Article, ctx?: { sourceId: string }): Promise<void> => {
    await Promise.allSettled([
      revalidate(env, a, fetchImpl, ctx?.sourceId),
      telegram(env, a, fetchImpl),
      indexNow(env, a, fetchImpl),
    ]);
  };
}

export function pathsFor(a: Article, sourceId?: string): string[] {
  const paths = ["/", `/haber/${a.slug}`, `/kategori/${a.category}`];
  const d = a.publishedAt ?? new Date();
  if (!sourceId || sourceId === "resmi-gazete") paths.push(`/resmi-gazete/${d.toISOString().slice(0, 10)}`);
  for (const t of a.tickers) paths.push(`/sirket/${t.toLowerCase()}`);
  if (a.tickers.length) paths.push("/sirket");
  return paths;
}

async function revalidate(env: Env, a: Article, f: typeof fetch, sourceId?: string) {
  if (!env.REVALIDATE_SECRET) return;
  await f(`${env.SITE_URL}/api/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-revalidate-secret": env.REVALIDATE_SECRET },
    body: JSON.stringify({ paths: pathsFor(a, sourceId) }),
  }).catch((e) => console.warn("[publish] revalidate failed:", (e as Error).message));
}

async function telegram(env: Env, a: Article, f: typeof fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) return;
  const text = `<b>${escapeHtml(a.title)}</b>\n${escapeHtml(a.dek)}\n${env.SITE_URL}/haber/${a.slug}`;
  await f(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHANNEL_ID, text, parse_mode: "HTML", disable_web_page_preview: false }),
  }).catch((e) => console.warn("[publish] telegram failed:", (e as Error).message));
}

async function indexNow(env: Env, a: Article, f: typeof fetch) {
  if (!env.INDEXNOW_KEY) return;
  const host = new URL(env.SITE_URL).host;
  await f(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(`${env.SITE_URL}/haber/${a.slug}`)}&key=${env.INDEXNOW_KEY}&keyLocation=${encodeURIComponent(`${env.SITE_URL}/${env.INDEXNOW_KEY}.txt`)}`, { headers: { host } })
    .catch((e) => console.warn("[publish] indexnow failed:", (e as Error).message));
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
