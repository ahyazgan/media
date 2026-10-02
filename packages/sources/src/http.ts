import { isAllowed, parseRobots, type RobotsRules } from "./robots.js";

export interface PoliteFetchOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Aynı host'a eş zamanlı istek sınırı (şartname: 2) */
  perHostConcurrency?: number;
  respectRobots?: boolean;
  /** Ek istek başlıkları (ör. JSON uç noktaları için `accept`) */
  headers?: Record<string, string>;
  /** Varsayılan GET; JSON gövdeli liste uçları (KAP) için POST */
  method?: "GET" | "POST";
  body?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_UA = () =>
  `KaynakBot/1.0 (+${process.env.SITE_URL ?? "https://kaynak.example"}/bot; ${process.env.BOT_CONTACT_EMAIL ?? "iletisim@kaynak.example"})`;

class Semaphore {
  private q: (() => void)[] = [];
  private active = 0;
  constructor(private readonly max: number) {}
  async acquire(): Promise<() => void> {
    if (this.active >= this.max) await new Promise<void>((r) => this.q.push(r));
    this.active++;
    return () => { this.active--; this.q.shift()?.(); };
  }
}

const hostSemaphores = new Map<string, Semaphore>();
const robotsCache = new Map<string, Promise<RobotsRules>>();

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

/**
 * Nezaket kuralları (şartname §4): robots.txt, kimlikli UA, 429/503'te üstel geri çekilme,
 * host başına en fazla 2 eş zamanlı istek.
 */
export async function politeFetch(url: string, opts: PoliteFetchOptions = {}): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  const ua = opts.userAgent ?? DEFAULT_UA();
  const u = new URL(url);
  const sem = hostSemaphores.get(u.host) ?? new Semaphore(opts.perHostConcurrency ?? 2);
  hostSemaphores.set(u.host, sem);

  if (opts.respectRobots !== false) {
    const rules = await robotsFor(u.origin, ua, f);
    if (!isAllowed(rules, u.pathname)) throw new Error(`robots.txt disallows ${u.pathname} on ${u.host}`);
  }

  const release = await sem.acquire();
  try {
    const maxRetries = opts.maxRetries ?? 3;
    let attempt = 0;
    for (;;) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30_000);
      try {
        const res = await f(url, { method: opts.method ?? "GET", body: opts.body, headers: { "user-agent": ua, accept: "text/html,application/pdf;q=0.9,*/*;q=0.8", ...opts.headers }, signal: ctl.signal, redirect: "follow" });
        if ((res.status === 429 || res.status === 503 || res.status >= 500) && attempt < maxRetries) {
          const ra = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt));
          attempt++; continue;
        }
        if (!res.ok) throw new HttpError(res.status, url);
        return res;
      } catch (e) {
        if (e instanceof HttpError) throw e;
        if (attempt >= maxRetries) throw e;
        await sleep(backoff(attempt)); attempt++;
      } finally { clearTimeout(t); }
    }
  } finally { release(); }
}

function robotsFor(origin: string, ua: string, f: typeof fetch): Promise<RobotsRules> {
  let p = robotsCache.get(origin);
  if (!p) {
    p = (async () => {
      try {
        const res = await f(`${origin}/robots.txt`, { headers: { "user-agent": ua } });
        if (!res.ok) return { disallow: [], allow: [] };
        return parseRobots(await res.text());
      } catch { return { disallow: [], allow: [] }; }
    })();
    robotsCache.set(origin, p);
  }
  return p;
}

const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Testler için önbellekleri sıfırla. */
export function _resetHttpState() { hostSemaphores.clear(); robotsCache.clear(); }
