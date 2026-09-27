const TZ = "Europe/Istanbul";

export function todayLabel(d = new Date()): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}
export function dateLabel(d: Date | string): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(typeof d === "string" ? new Date(d) : d);
}
export function dateTimeLabel(d: Date | string): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(typeof d === "string" ? new Date(d) : d);
}
/** Türkiye saatine göre bugünün YYYY-MM-DD'si */
export function todayIso(d = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
