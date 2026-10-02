import { politeFetch, type PoliteFetchOptions } from "../http.js";
import { parseTcmbCalendar, parseTuikCalendar, parseTuikCalendarJson, type CalendarEntry } from "./parse.js";

/**
 * Canlıda doğrulandı (2026-10-02). TÜİK: ulusal takvimin JSON ucu (`yil` parametresi yıl başına çağrılır; eski
 * data.tuik.gov.tr/Bulten/UlusalVeriYayimlamaTakvimi SPA'ya yönlenir ve tarih içermez). TCMB: "Takvim" sayfası
 * (PPK kararı, PPK özeti, Enflasyon Raporu, Finansal İstikrar Raporu sütunları; eski PPK+Toplanti+Takvimi 404 döner).
 */
export const TUIK_DEFAULT_CALENDAR = "https://www.tuik.gov.tr/Kurumsal/GetYillikHaberBulteniListesi?yil={yil}";
export const TUIK_CALENDAR_PAGE = "https://www.tuik.gov.tr/Kurumsal/Veri_Takvimi";
export const TCMB_DEFAULT_CALENDAR = "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Duyurular/Takvim";

export interface CalendarImportOptions { tuikUrl?: string; tcmbUrl?: string; http?: PoliteFetchOptions; year?: number }

/** İki kurumun takvimlerini çekip birleştirir; biri hata verirse diğeri yine döner (hatalar `errors`te). */
export async function importCalendars(opts: CalendarImportOptions = {}): Promise<{ entries: CalendarEntry[]; errors: { institution: string; error: string }[] }> {
  const tuikUrl = opts.tuikUrl ?? process.env.TUIK_CALENDAR_URL ?? TUIK_DEFAULT_CALENDAR;
  const tcmbUrl = opts.tcmbUrl ?? process.env.TCMB_CALENDAR_URL ?? TCMB_DEFAULT_CALENDAR;
  const year = opts.year ?? new Date().getFullYear();
  // Kasım-Aralık'ta gelecek yılın ilk bültenleri de gerekir (Ocak TÜFE'si vb.)
  const years = new Date().getMonth() >= 10 && !opts.year ? [year, year + 1] : [year];
  const entries: CalendarEntry[] = [];
  const errors: { institution: string; error: string }[] = [];
  const jobs: [string, () => Promise<CalendarEntry[]>][] = [
    ["tuik", async () => {
      const urls = tuikUrl.includes("{yil}") ? years.map((y) => tuikUrl.replace("{yil}", String(y))) : [tuikUrl];
      const out: CalendarEntry[] = [];
      for (const url of urls) out.push(...parseTuik(await (await politeFetch(url, { ...opts.http, headers: { accept: "application/json, text/html;q=0.8", ...opts.http?.headers } })).text(), url));
      if (!out.length) throw new Error(`TÜİK takviminde bülten bulunamadı (${urls.join(", ")}) — adres ya da biçim değişmiş olabilir`);
      return out;
    }],
    ["tcmb", async () => parseTcmbCalendar(await (await politeFetch(tcmbUrl, opts.http)).text(), { sourceUrl: tcmbUrl, year: opts.year })],
  ];
  for (const [inst, job] of jobs) {
    try { entries.push(...(await job())); } catch (e) { errors.push({ institution: inst, error: (e as Error).message }); }
  }
  return { entries, errors };
}

/** JSON ucu ya da (ezilmiş adres) eski HTML tablo biçimi */
function parseTuik(body: string, url: string): CalendarEntry[] {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseTuikCalendarJson(JSON.parse(trimmed), { sourceUrl: TUIK_CALENDAR_PAGE });
  return parseTuikCalendar(body, { sourceUrl: url });
}
