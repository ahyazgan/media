import type { Article, Db } from "@kaynak/db";
import type { Env } from "./env.js";
import { sendPushForArticle, type PushSender } from "./push.js";
import { postArticleToX } from "./x.js";
import { distributionLog, type Db as _Db } from "@kaynak/db";

export interface PublishHooks {
  fetchImpl?: typeof fetch;
  /** Web push için gerekli (abonelikler DB'de). Verilmezse push atlanır. */
  db?: Db;
  push?: PushSender;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * publish sonrası: ISR revalidate, Telegram (her haber), web push (importance >= PUSH_MIN_IMPORTANCE, kategori aboneliğine göre),
 * IndexNow (Faz 4). Hiçbiri pipeline'ı düşürmez; hepsi paralel ve hataları yutulup loglanır.
 */
export function makeOnPublished(env: Env, hooks: PublishHooks | typeof fetch = {}) {
  const h: PublishHooks = typeof hooks === "function" ? { fetchImpl: hooks } : hooks;
  const fetchImpl = h.fetchImpl ?? fetch;
  return async (a: Article, ctx?: { sourceId: string }): Promise<void> => {
    const jobs: Promise<unknown>[] = [
      revalidate(env, a, fetchImpl, ctx?.sourceId),
      telegram(env, a, fetchImpl).then((sent) => { if (sent !== undefined && h.db) return logTelegram(h.db, a, sent); }),
      indexNow(env, a, fetchImpl),
    ];
    if (h.db && h.push && a.importance >= env.PUSH_MIN_IMPORTANCE) {
      jobs.push(sendPushForArticle(h.db, h.push, a, env.SITE_URL, h.log).catch((e) => console.warn("[publish] push failed:", (e as Error).message)));
    }
    if (h.db) {
      const db = h.db;
      jobs.push(postArticleToX(db, env, a, fetchImpl).then((r) => h.log?.("x", { article: a.slug, ...r })).catch((e) => console.warn("[publish] x failed:", (e as Error).message)));
    }
    await Promise.allSettled(jobs);
  };
}

export function pathsFor(a: Article, sourceId?: string): string[] {
  const paths = ["/", `/haber/${a.slug}`, `/kategori/${a.category}`];
  const d = a.publishedAt ?? new Date();
  if (!sourceId || sourceId === "resmi-gazete") paths.push(`/resmi-gazete/${d.toISOString().slice(0, 10)}`);
  for (const t of a.tickers) paths.push(`/sirket/${t.toLowerCase()}`);
  if (a.tickers.length) paths.push("/sirket");
  if (sourceId === "tcmb" || sourceId === "tuik") paths.push("/takvim");
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

/** Telegram: her haber, başlık + dek + link. Döndürdüğü değer: gönderildi mi (undefined = yapılandırılmamış). */
async function telegram(env: Env, a: Article, f: typeof fetch): Promise<{ ok: boolean; detail?: string } | undefined> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) return undefined;
  const text = `<b>${escapeHtml(a.title)}</b>\n${escapeHtml(a.dek)}\n${env.SITE_URL}/haber/${a.slug}`;
  try {
    const res = await f(`${env.TELEGRAM_API_BASE ?? "https://api.telegram.org"}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHANNEL_ID, text, parse_mode: "HTML", disable_web_page_preview: false }),
    });
    return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) { console.warn("[publish] telegram failed:", (e as Error).message); return { ok: false, detail: (e as Error).message }; }
}
async function logTelegram(db: _Db, a: Article, r: { ok: boolean; detail?: string }) {
  await db.insert(distributionLog).values({ channel: "telegram", articleId: a.id, status: r.ok ? "ok" : "failed", detail: r.detail ?? null }).catch(() => {});
}

async function indexNow(env: Env, a: Article, f: typeof fetch) {
  if (!env.INDEXNOW_KEY) return;
  const host = new URL(env.SITE_URL).host;
  await f(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(`${env.SITE_URL}/haber/${a.slug}`)}&key=${env.INDEXNOW_KEY}&keyLocation=${encodeURIComponent(`${env.SITE_URL}/${env.INDEXNOW_KEY}.txt`)}`, { headers: { host } })
    .catch((e) => console.warn("[publish] indexnow failed:", (e as Error).message));
}

export const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
