import { eq } from "drizzle-orm";
import { sourceHealth, type Db, type SourceHealthRow } from "@kaynak/db";
import { classifySourceError, describeSourceError, type SourceErrorKind } from "@kaynak/sources";
import type { Alerter } from "./alerts.js";

export type HealthStatus = "ok" | "degraded" | "failing" | "stale" | "unknown";

/** Kendiliğinden düzelmeyen hatalar: ilk seferde "failing". */
const IMMEDIATE: SourceErrorKind[] = ["structure", "tls", "robots"];
/** Geçici olabilecek hatalar bu kadar üst üste olunca "failing". */
export const FAILING_AFTER = 3;
/**
 * Bu kadar saat hiç öğe dönmezse "stale" (kaynak susmuş ya da adres şeması değişmiş olabilir).
 * Resmi Gazete her gün yayımlanır; KAP hafta sonu ve bayramda sessizdir; kurum duyuruları seyrektir.
 */
export const SILENCE_HOURS: Record<string, number> = {
  "resmi-gazete": 30, kap: 96, tcmb: 24 * 14, tuik: 24 * 14, spk: 24 * 10, bddk: 24 * 45, epdk: 24 * 45, botas: 24 * 45,
};
const DEFAULT_SILENCE_HOURS = 24 * 7;
/** Bozuk durum sürerken hatırlatma aralığı */
export const REMIND_AFTER_HOURS = 24;

type HealthFields = Pick<SourceHealthRow, "sourceId" | "consecutiveFailures" | "lastErrorKind" | "lastItemsAt" | "lastOkAt">;

export function statusOf(row: HealthFields, now = new Date()): HealthStatus {
  if (row.consecutiveFailures > 0) {
    if (IMMEDIATE.includes(row.lastErrorKind as SourceErrorKind) || row.consecutiveFailures >= FAILING_AFTER) return "failing";
    return "degraded";
  }
  if (!row.lastOkAt) return "unknown";
  if (row.lastItemsAt) {
    const hours = (now.getTime() - row.lastItemsAt.getTime()) / 3_600_000;
    if (hours > (SILENCE_HOURS[row.sourceId] ?? DEFAULT_SILENCE_HOURS)) return "stale";
  }
  return "ok";
}

export type WatchOutcome = { ok: true; fetched: number } | { ok: false; error: unknown };

/** Bir taramanın sonucunu kaydeder; yeni durumu döndürür. */
export async function recordWatch(db: Db, sourceId: string, outcome: WatchOutcome, now = new Date()): Promise<SourceHealthRow> {
  const [prev] = await db.select().from(sourceHealth).where(eq(sourceHealth.sourceId, sourceId)).limit(1);
  const base = prev ?? {
    sourceId, status: "unknown", lastRunAt: null, lastOkAt: null, lastItemsAt: null, lastFetched: 0, consecutiveFailures: 0,
    lastError: null, lastErrorKind: null, lastErrorAt: null, alertedStatus: null, alertedAt: null, updatedAt: now,
  };
  const next: SourceHealthRow = outcome.ok
    ? { ...base, lastRunAt: now, lastOkAt: now, lastFetched: outcome.fetched, lastItemsAt: outcome.fetched > 0 ? now : base.lastItemsAt, consecutiveFailures: 0, updatedAt: now }
    : { ...base, lastRunAt: now, consecutiveFailures: base.consecutiveFailures + 1, lastError: describeSourceError(outcome.error), lastErrorKind: classifySourceError(outcome.error), lastErrorAt: now, updatedAt: now };
  next.status = statusOf(next, now);
  const { sourceId: _id, ...set } = next;
  await db.insert(sourceHealth).values(next).onConflictDoUpdate({ target: sourceHealth.sourceId, set });
  return next;
}

const LABEL: Record<HealthStatus, string> = { ok: "çalışıyor", degraded: "aksıyor", failing: "BOZUK", stale: "SESSİZ", unknown: "bilinmiyor" };

/**
 * Duruma göre uyarı: failing/stale'e geçişte bir kez, sürerken REMIND_AFTER_HOURS'ta bir hatırlatma,
 * düzelince "düzeldi". degraded uyarı üretmez (geçici ağ hataları).
 */
export async function alertIfNeeded(db: Db, row: SourceHealthRow, alerter: Alerter, now = new Date()): Promise<"alerted" | "recovered" | "reminded" | null> {
  const bad = row.status === "failing" || row.status === "stale";
  let kind: "alerted" | "recovered" | "reminded" | null = null;
  if (bad && row.alertedStatus !== row.status) kind = "alerted";
  else if (bad && row.alertedAt && now.getTime() - row.alertedAt.getTime() > REMIND_AFTER_HOURS * 3_600_000) kind = "reminded";
  else if (row.status === "ok" && (row.alertedStatus === "failing" || row.alertedStatus === "stale")) kind = "recovered";
  if (!kind) return null;

  const subject = kind === "recovered" ? `✅ ${row.sourceId} yeniden çalışıyor` : `🔴 ${row.sourceId}: ${LABEL[row.status as HealthStatus]}${kind === "reminded" ? " (sürüyor)" : ""}`;
  const lines = kind === "recovered"
    ? [`Son başarılı tarama: ${row.lastOkAt?.toISOString() ?? "—"}`]
    : row.status === "stale"
      ? [`${SILENCE_HOURS[row.sourceId] ?? DEFAULT_SILENCE_HOURS} saattir hiç öğe gelmedi. Son öğe: ${row.lastItemsAt?.toISOString() ?? "—"}.`, "Adres şeması değişmiş ya da kaynak yayını durmuş olabilir."]
      : [`Hata türü: ${row.lastErrorKind} · üst üste ${row.consecutiveFailures} kez`, `Hata: ${row.lastError ?? "—"}`, `Son başarılı tarama: ${row.lastOkAt?.toISOString() ?? "hiç"}`];
  lines.push("", "Ayrıntı: /admin/kaynaklar");
  await alerter.send(subject, lines.join("\n"));
  await db.update(sourceHealth).set({ alertedStatus: row.status, alertedAt: now }).where(eq(sourceHealth.sourceId, row.sourceId));
  return kind;
}

/** Tarama olmadan da bayatlığı yakalamak için periyodik kontrol (worker her 30 dk). */
export async function checkSources(db: Db, enabledIds: string[], alerter: Alerter, now = new Date()) {
  const rows = await db.select().from(sourceHealth);
  const out: { sourceId: string; status: HealthStatus; alert: string | null }[] = [];
  for (const row of rows.filter((r) => enabledIds.includes(r.sourceId))) {
    const status = statusOf(row, now);
    if (status !== row.status) await db.update(sourceHealth).set({ status, updatedAt: now }).where(eq(sourceHealth.sourceId, row.sourceId));
    out.push({ sourceId: row.sourceId, status, alert: await alertIfNeeded(db, { ...row, status }, alerter, now) });
  }
  return out;
}

export interface SourcesHealthReport {
  ok: boolean;
  sources: { sourceId: string; status: HealthStatus; lastOkAt: Date | null; lastItemsAt: Date | null; consecutiveFailures: number; lastErrorKind: string | null; lastError: string | null }[];
}

/** Sağlık ucu ve admin için: etkin kaynakların durumu. failing ya da stale varsa ok=false. */
export function summarizeSources(rows: SourceHealthRow[], enabledIds: string[], now = new Date()): SourcesHealthReport {
  const byId = new Map(rows.map((r) => [r.sourceId, r]));
  const sources = enabledIds.map((id) => {
    const r = byId.get(id);
    return {
      sourceId: id, status: r ? statusOf(r, now) : ("unknown" as HealthStatus),
      lastOkAt: r?.lastOkAt ?? null, lastItemsAt: r?.lastItemsAt ?? null, consecutiveFailures: r?.consecutiveFailures ?? 0,
      lastErrorKind: r?.lastErrorKind ?? null, lastError: r?.lastError ?? null,
    };
  });
  return { ok: !sources.some((s) => s.status === "failing" || s.status === "stale"), sources };
}
