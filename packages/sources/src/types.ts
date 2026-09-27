/** Şartname §4 — adapter sözleşmesi. */
export interface RawEvent {
  sourceId: string;
  externalId: string;
  title: string;
  url: string;
  publishedAt: Date;
  payloadHash: string;
  payload: Record<string, unknown>;
}

export interface FetchedDocument {
  url: string;
  mime: string;
  bytes: Buffer;
}

/**
 * Zaman pencerelerine göre tarama sıklığı (saniye). `between` yerel saat, "HH:MM";
 * `weekdays` verilirse pencere yalnızca o günlerde geçerlidir (0 = Pazar … 6 = Cumartesi).
 */
export interface CronLike {
  timezone: string;
  windows: { between: [string, string]; everySeconds: number; weekdays?: number[] }[];
  defaultEverySeconds: number;
  /** Takvimde yakın bir yayın varsa (worker `hot=true` verir) kullanılacak sıklık — TCMB/TÜİK: 30 sn */
  hotEverySeconds?: number;
}

export interface SourceAdapter {
  id: string;
  official: boolean;
  schedule(): CronLike;
  fetchNew(since: Date): Promise<RawEvent[]>;
  fetchDocument(ev: RawEvent): Promise<FetchedDocument>;
}

/** Şu anki yerel saate göre kaç saniyede bir taranmalı. */
export function intervalFor(schedule: CronLike, now = new Date(), hot = false): number {
  if (hot && schedule.hotEverySeconds) return schedule.hotEverySeconds;
  const hm = new Intl.DateTimeFormat("tr-TR", { timeZone: schedule.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const weekday = weekdayIn(schedule.timezone, now);
  for (const w of schedule.windows) {
    if (w.weekdays && !w.weekdays.includes(weekday)) continue;
    if (hm >= w.between[0] && hm <= w.between[1]) return w.everySeconds;
  }
  return schedule.defaultEverySeconds;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Verilen saat diliminde haftanın günü (0 = Pazar). */
export function weekdayIn(timeZone: string, now = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  return Math.max(0, WEEKDAYS.indexOf(name));
}
