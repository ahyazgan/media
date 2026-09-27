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

/** Zaman pencerelerine göre tarama sıklığı (saniye). `between` yerel saat, "HH:MM". */
export interface CronLike {
  timezone: string;
  windows: { between: [string, string]; everySeconds: number }[];
  defaultEverySeconds: number;
}

export interface SourceAdapter {
  id: string;
  official: boolean;
  schedule(): CronLike;
  fetchNew(since: Date): Promise<RawEvent[]>;
  fetchDocument(ev: RawEvent): Promise<FetchedDocument>;
}

/** Şu anki yerel saate göre kaç saniyede bir taranmalı. */
export function intervalFor(schedule: CronLike, now = new Date()): number {
  const hm = new Intl.DateTimeFormat("tr-TR", { timeZone: schedule.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  for (const w of schedule.windows) {
    if (hm >= w.between[0] && hm <= w.between[1]) return w.everySeconds;
  }
  return schedule.defaultEverySeconds;
}
