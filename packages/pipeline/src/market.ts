/** Piyasa şeridi: EVDS kurlarını market_quotes'a yazar; ana sayfa son değer + bir önceki güne göre değişimi gösterir. */
import { and, desc, eq, inArray } from "drizzle-orm";
import { marketQuotes, type Db } from "@kaynak/db";
import { EVDS_DEFAULT_SERIES, fetchEvds, type QuotePoint } from "@kaynak/sources";

export async function upsertQuotes(db: Db, points: QuotePoint[]): Promise<number> {
  let n = 0;
  for (const p of points) {
    const rows = await db.insert(marketQuotes).values({ series: p.series, date: p.date, value: p.value })
      .onConflictDoUpdate({ target: [marketQuotes.series, marketQuotes.date], set: { value: p.value, fetchedAt: new Date() } }).returning({ id: marketQuotes.id });
    n += rows.length;
  }
  return n;
}

export async function syncMarketQuotes(db: Db, apiKey: string | undefined, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<{ points: number; skipped?: string }> {
  if (!apiKey) return { points: 0, skipped: "EVDS_API_KEY yok" };
  const pts = await fetchEvds(apiKey, EVDS_DEFAULT_SERIES.map((s) => s.code), { now: opts.now, http: opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : undefined });
  return { points: await upsertQuotes(db, pts) };
}

export interface TickerItem { symbol: string; label: string; value: string; change: number; date: string }

/** Her seri için son iki gün: değer ve yüzde değişim. Veri yoksa boş dizi (şerit gizlenir). */
export async function tickerItems(db: Db, series = EVDS_DEFAULT_SERIES): Promise<TickerItem[]> {
  const rows = await db.select().from(marketQuotes).where(inArray(marketQuotes.series, series.map((s) => s.code))).orderBy(desc(marketQuotes.date)).limit(series.length * 4);
  const out: TickerItem[] = [];
  for (const s of series) {
    const [last, prev] = rows.filter((r) => r.series === s.code);
    if (!last) continue;
    const change = prev ? ((last.value - prev.value) / prev.value) * 100 : 0;
    out.push({ symbol: s.symbol, label: s.label, value: last.value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }), change: Math.round(change * 100) / 100, date: last.date });
  }
  return out;
}

export async function latestQuoteDate(db: Db, series: string): Promise<string | null> {
  const [r] = await db.select({ d: marketQuotes.date }).from(marketQuotes).where(and(eq(marketQuotes.series, series))).orderBy(desc(marketQuotes.date)).limit(1);
  return r?.d ?? null;
}
