/**
 * TCMB EVDS (Elektronik Veri Dağıtım Sistemi) istemcisi — piyasa şeridi için resmi kur verisi.
 * Uç: https://evds2.tcmb.gov.tr/service/evds/series=<S1>-<S2>&startDate=dd-MM-yyyy&endDate=dd-MM-yyyy&type=json, başlık `key: EVDS_API_KEY`.
 * Yanıt: { totalCount, items: [{ Tarih: "26-09-2026", TP_DK_USD_A: "41.2345", ... }] } — tatil günlerinde değerler null.
 * Seri kodları: TP.DK.USD.A (USD alış), TP.DK.EUR.A, TP.DK.GBP.A; A=alış, S=satış. Ayrıştırıcı hoşgörülüdür (noktalı/alt çizgili alan adları).
 */
import { politeFetch, type PoliteFetchOptions } from "./http.js";

export const EVDS_BASE = "https://evds2.tcmb.gov.tr/service/evds";
export const DEFAULT_SERIES: { code: string; symbol: string; label: string }[] = [
  { code: "TP.DK.USD.A", symbol: "USD/TRY", label: "Dolar (TCMB alış)" },
  { code: "TP.DK.EUR.A", symbol: "EUR/TRY", label: "Euro (TCMB alış)" },
  { code: "TP.DK.GBP.A", symbol: "GBP/TRY", label: "Sterlin (TCMB alış)" },
];

export interface QuotePoint { series: string; date: string; value: number }

const fmt = (d: Date) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d); const g = (t: string) => p.find((x) => x.type === t)!.value; return `${g("day")}-${g("month")}-${g("year")}`; };

export function evdsUrl(series: string[], start: Date, end: Date, base = EVDS_BASE): string {
  return `${base}/series=${series.join("-")}&startDate=${fmt(start)}&endDate=${fmt(end)}&type=json`;
}

/** "26-09-2026" ya da "26.09.2026" → "2026-09-26" */
function isoDate(s: string): string | undefined {
  const m = /^(\d{2})[-.](\d{2})[-.](\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/** Yanıt JSON'unu (items) seri/tarih/değer noktalarına çevirir; null ve sayı olmayan değerler atlanır. */
export function parseEvds(json: unknown, series: string[]): QuotePoint[] {
  const items = (json as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  const out: QuotePoint[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const row = it as Record<string, unknown>;
    const date = isoDate(String(row["Tarih"] ?? row["tarih"] ?? row["date"] ?? ""));
    if (!date) continue;
    for (const s of series) {
      const key = Object.keys(row).find((k) => k === s || k === s.replace(/\./g, "_") || k.toUpperCase() === s.replace(/\./g, "_").toUpperCase());
      const v = key ? row[key] : undefined;
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
      if (Number.isFinite(n) && n > 0) out.push({ series: s, date, value: n });
    }
  }
  return out;
}

export async function fetchEvds(apiKey: string, series = DEFAULT_SERIES.map((s) => s.code), opts: { days?: number; now?: Date; http?: PoliteFetchOptions; base?: string } = {}): Promise<QuotePoint[]> {
  const now = opts.now ?? new Date();
  const start = new Date(now.getTime() - (opts.days ?? 10) * 86_400_000);
  const res = await politeFetch(evdsUrl(series, start, now, opts.base), { ...opts.http, headers: { key: apiKey, accept: "application/json", ...opts.http?.headers } });
  return parseEvds(await res.json(), series);
}
