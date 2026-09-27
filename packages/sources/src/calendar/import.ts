import { politeFetch, type PoliteFetchOptions } from "../http.js";
import { parseTcmbCalendar, parseTuikCalendar, type CalendarEntry } from "./parse.js";

export const TUIK_DEFAULT_CALENDAR = "https://data.tuik.gov.tr/Bulten/UlusalVeriYayimlamaTakvimi";
export const TCMB_DEFAULT_CALENDAR = "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Para+Politikasi+Kurulu/PPK+Toplanti+Takvimi";

export interface CalendarImportOptions { tuikUrl?: string; tcmbUrl?: string; http?: PoliteFetchOptions; year?: number }

/** İki kurumun takvim sayfalarını çekip birleştirir; biri hata verirse diğeri yine döner (hatalar `errors`te). */
export async function importCalendars(opts: CalendarImportOptions = {}): Promise<{ entries: CalendarEntry[]; errors: { institution: string; error: string }[] }> {
  const tuikUrl = opts.tuikUrl ?? process.env.TUIK_CALENDAR_URL ?? TUIK_DEFAULT_CALENDAR;
  const tcmbUrl = opts.tcmbUrl ?? process.env.TCMB_CALENDAR_URL ?? TCMB_DEFAULT_CALENDAR;
  const entries: CalendarEntry[] = [];
  const errors: { institution: string; error: string }[] = [];
  const jobs: [string, () => Promise<CalendarEntry[]>][] = [
    ["tuik", async () => parseTuikCalendar(await (await politeFetch(tuikUrl, opts.http)).text(), { sourceUrl: tuikUrl })],
    ["tcmb", async () => parseTcmbCalendar(await (await politeFetch(tcmbUrl, opts.http)).text(), { sourceUrl: tcmbUrl, year: opts.year })],
  ];
  for (const [inst, job] of jobs) {
    try { entries.push(...(await job())); } catch (e) { errors.push({ institution: inst, error: (e as Error).message }); }
  }
  return { entries, errors };
}
