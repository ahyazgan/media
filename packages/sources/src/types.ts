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
  /**
   * Belge metninin kaynağa özgü sabit kalıplardan arınmış hâli (KAP: "Özet Bilgi" alanları ve sorumluluk beyanı). Yalnızca
   * uzunluk alt sınırının hesabında kullanılır; sayı kontrolü ve yazar belgenin tamamını görür.
   */
  contentText?(text: string): string;
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

/**
 * Bir sonraki taramaya kadar beklenecek süre (saniye): `intervalFor`, ama bir sonraki sık tarama penceresinin başlangıcını
 * aşmaz. Örn. Resmi Gazete 23:29'da 30 dk beklerse 23:30–00:00 penceresinin ilk yarım saati kaçardı → 60 sn beklenir.
 */
export function nextDelaySeconds(schedule: CronLike, now = new Date(), hot = false): number {
  const base = intervalFor(schedule, now, hot);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: schedule.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  const nowSec = Number(p["hour"]) * 3600 + Number(p["minute"]) * 60 + Number(p["second"]);
  const weekday = weekdayIn(schedule.timezone, now);
  let best = base;
  for (const dayOffset of [0, 1]) {
    const wd = (weekday + dayOffset) % 7;
    for (const w of schedule.windows) {
      if (w.weekdays && !w.weekdays.includes(wd)) continue;
      if (w.everySeconds >= base) continue;
      const [hh, mm] = w.between[0].split(":").map(Number);
      const delta = dayOffset * 86_400 + hh! * 3600 + mm! * 60 - nowSec;
      if (delta > 0 && delta < best) best = delta;
    }
  }
  return Math.max(30, best);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Verilen saat diliminde haftanın günü (0 = Pazar). */
export function weekdayIn(timeZone: string, now = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  return Math.max(0, WEEKDAYS.indexOf(name));
}
