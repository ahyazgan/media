import { and, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { articles, newsletterSubscribers, rawEvents, type Article, type CalendarEvent, type Db } from "@kaynak/db";
import { upcomingEvents } from "./calendar.js";
import type { Mailer } from "./mail.js";
import type { Env } from "./env.js";

const TZ = "Europe/Istanbul";
const INSTITUTION: Record<string, string> = { tcmb: "TCMB", tuik: "TÜİK" };

export interface BulletinData {
  dateLabel: string;
  gazette: { title: string; url: string; articleSlug: string | null; sectionLabel: string }[];
  gazetteDate: string | null;
  calendar: CalendarEvent[];
  top: Article[];
}

/** Türkiye saatine göre günün YYYY-MM-DD'si */
export function istanbulDate(d = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Şartname §8: 07:30 sabah bülteni — dün gece Resmi Gazete, bugünün takvimi, en önemli 5 haber. */
export async function composeBulletin(db: Db, opts: { now?: Date } = {}): Promise<BulletinData> {
  const now = opts.now ?? new Date();
  const today = istanbulDate(now);
  const dayStart = new Date(`${today}T00:00:00+03:00`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  // Bugün tarihli Resmi Gazete (gece yayımlanır); yoksa boş — bülten yine çıkar.
  const gz = await db.select({ title: rawEvents.title, url: rawEvents.url, payload: rawEvents.payload, publishedAt: rawEvents.publishedAt, articleSlug: articles.slug, status: articles.status })
    .from(rawEvents).leftJoin(articles, eq(articles.rawEventId, rawEvents.id))
    .where(and(eq(rawEvents.sourceId, "resmi-gazete"), gte(rawEvents.publishedAt, dayStart), lt(rawEvents.publishedAt, dayEnd)))
    .orderBy(rawEvents.externalId);
  const gazette = gz.map((r) => ({ title: r.title, url: r.url, articleSlug: r.status === "published" ? r.articleSlug : null, sectionLabel: String((r.payload as { sectionLabel?: string }).sectionLabel ?? "Diğer") }));

  const cal = (await upcomingEvents(db, { from: dayStart, days: 1 })).filter((e) => e.scheduledAt >= dayStart && e.scheduledAt < dayEnd);
  const top = await db.select().from(articles)
    .where(and(eq(articles.status, "published"), gte(articles.publishedAt, new Date(now.getTime() - 24 * 3_600_000))))
    .orderBy(desc(articles.importance), desc(articles.publishedAt)).limit(5);

  const dateLabel = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  return { dateLabel, gazette, gazetteDate: gazette.length ? today : null, calendar: cal, top };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const clock = (d: Date) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

export interface BulletinSponsor { name: string; text: string; url: string }

/** HTML + düz metin gövde. `unsubscribeUrl` boş verilirse iptal satırı eklenmez (önizleme). Sponsor bloğu "Sponsorlu" etiketiyle en üstte. */
export function renderBulletin(data: BulletinData, siteUrl: string, unsubscribeUrl?: string, sponsor?: BulletinSponsor): { subject: string; html: string; text: string } {
  const subject = `Kaynak sabah bülteni · ${data.dateLabel}`;
  const link = (path: string) => `${siteUrl}${path}`;
  const h: string[] = [];
  const t: string[] = [];
  h.push(`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#1A1826;line-height:1.5">`);
  h.push(`<h1 style="font-size:24px;margin:0 0 4px">Kaynak<span style="color:#E0187B">.</span> sabah bülteni</h1><p style="margin:0 0 20px;color:#7A7388">${esc(data.dateLabel)} · Resmi kaynaktan, dakikalar içinde, doğrulanmış.</p>`);
  t.push(`KAYNAK SABAH BÜLTENİ — ${data.dateLabel}`, "");
  if (sponsor && /^https?:\/\//.test(sponsor.url)) {
    h.push(`<div style="margin:0 0 20px;padding:12px 14px;background:#F6F3F7;border-radius:6px;font-size:14px"><span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7A7388">Sponsorlu</span><br><b>${esc(sponsor.name)}</b> — ${esc(sponsor.text)} <a href="${esc(sponsor.url)}" style="color:#E0187B">Ayrıntı →</a></div>`);
    t.push(`[SPONSORLU] ${sponsor.name} — ${sponsor.text} ${sponsor.url}`, "");
  }

  h.push(`<h2 style="font-size:17px;border-bottom:2px solid #1A1826;padding-bottom:4px">En önemli haberler</h2>`);
  t.push("EN ÖNEMLİ HABERLER");
  if (!data.top.length) { h.push(`<p style="color:#7A7388">Son 24 saatte yayınlanan haber yok.</p>`); t.push("Son 24 saatte yayınlanan haber yok."); }
  for (const a of data.top) {
    h.push(`<p style="margin:10px 0"><a href="${link(`/haber/${a.slug}`)}" style="color:#1A1826;font-weight:700;text-decoration:none">${esc(a.title)}</a><br><span style="color:#4B4458">${esc(a.dek)}</span></p>`);
    t.push(`- ${a.title}\n  ${a.dek}\n  ${link(`/haber/${a.slug}`)}`);
  }

  h.push(`<h2 style="font-size:17px;border-bottom:2px solid #0E9A9A;padding-bottom:4px;margin-top:24px">Bugünün takvimi</h2>`);
  t.push("", "BUGÜNÜN TAKVİMİ");
  if (!data.calendar.length) { h.push(`<p style="color:#7A7388">Bugün planlı veri açıklaması yok.</p>`); t.push("Bugün planlı veri açıklaması yok."); }
  for (const e of data.calendar) {
    const line = `${clock(e.scheduledAt)} · ${INSTITUTION[e.institution] ?? e.institution} · ${e.title}`;
    h.push(`<p style="margin:6px 0">${esc(line)}</p>`); t.push(`- ${line}`);
  }
  h.push(`<p style="margin:6px 0"><a href="${link("/takvim")}" style="color:#0E9A9A">Takvimin tamamı →</a></p>`);

  h.push(`<h2 style="font-size:17px;border-bottom:2px solid #0E9A9A;padding-bottom:4px;margin-top:24px">Resmi Gazete${data.gazetteDate ? "" : " (bugün henüz yayımlanmadı)"}</h2>`);
  t.push("", "RESMİ GAZETE");
  const groups = new Map<string, BulletinData["gazette"]>();
  for (const g of data.gazette) groups.set(g.sectionLabel, [...(groups.get(g.sectionLabel) ?? []), g]);
  for (const [label, items] of groups) {
    h.push(`<p style="margin:10px 0 2px;font-size:12px;font-weight:700;text-transform:uppercase;color:#7A7388">${esc(label)}</p>`); t.push(`[${label}]`);
    for (const g of items) {
      const href = g.articleSlug ? link(`/haber/${g.articleSlug}`) : g.url;
      h.push(`<p style="margin:4px 0"><a href="${href}" style="color:#1A1826;text-decoration:none">${esc(g.title)}</a>${g.articleSlug ? ' <span style="font-size:11px;color:#E0187B;font-weight:700">HABER</span>' : ""}</p>`);
      t.push(`- ${g.title}\n  ${href}`);
    }
  }
  if (data.gazetteDate) { h.push(`<p style="margin:6px 0"><a href="${link(`/resmi-gazete/${data.gazetteDate}`)}" style="color:#0E9A9A">Günün tamamı →</a></p>`); }

  h.push(`<p style="margin-top:28px;font-size:12px;color:#7A7388;border-top:1px solid #E7E1EA;padding-top:10px">Yatırım tavsiyesi değildir. Haberler resmi belgelerden otomatik üretilir ve editör kurallarından geçer.${unsubscribeUrl ? ` <a href="${unsubscribeUrl}" style="color:#7A7388">Abonelikten çık</a>` : ""}</p></div>`);
  t.push("", "Yatırım tavsiyesi değildir." + (unsubscribeUrl ? `\nAbonelikten çık: ${unsubscribeUrl}` : ""));
  return { subject, html: h.join("\n"), text: t.join("\n") };
}

/** Onaylı, iptal etmemiş abonelere gönderir; sonuçları döndürür. Gönderim hatası tek aboneyi atlar. */
export function sponsorFromEnv(env: Partial<Pick<Env, "BULLETIN_SPONSOR_NAME" | "BULLETIN_SPONSOR_TEXT" | "BULLETIN_SPONSOR_URL">>): BulletinSponsor | undefined {
  return env.BULLETIN_SPONSOR_NAME && env.BULLETIN_SPONSOR_TEXT && env.BULLETIN_SPONSOR_URL ? { name: env.BULLETIN_SPONSOR_NAME, text: env.BULLETIN_SPONSOR_TEXT, url: env.BULLETIN_SPONSOR_URL } : undefined;
}

export async function sendBulletin(db: Db, mailer: Mailer, env: Pick<Env, "SITE_URL"> & Partial<Pick<Env, "BULLETIN_SPONSOR_NAME" | "BULLETIN_SPONSOR_TEXT" | "BULLETIN_SPONSOR_URL">>, opts: { now?: Date; log?: (m: string, meta?: Record<string, unknown>) => void } = {}) {
  const data = await composeBulletin(db, { now: opts.now });
  const sponsor = sponsorFromEnv(env);
  const subs = await db.select().from(newsletterSubscribers).where(and(isNotNull(newsletterSubscribers.confirmedAt), isNull(newsletterSubscribers.unsubscribedAt)));
  let sent = 0, failed = 0;
  for (const s of subs) {
    const { subject, html, text } = renderBulletin(data, env.SITE_URL, `${env.SITE_URL}/api/bulten/iptal?token=${s.token}`, sponsor);
    try {
      await mailer.send({ to: s.email, subject, html, text, headers: { "List-Unsubscribe": `<${env.SITE_URL}/api/bulten/iptal?token=${s.token}>` } });
      await db.update(newsletterSubscribers).set({ lastSentAt: new Date() }).where(eq(newsletterSubscribers.id, s.id));
      sent++;
    } catch (e) { failed++; opts.log?.("bulletin:fail", { email: s.email, error: (e as Error).message }); }
  }
  opts.log?.("bulletin", { subscribers: subs.length, sent, failed, top: data.top.length, calendar: data.calendar.length, gazette: data.gazette.length });
  return { data, sent, failed, subscribers: subs.length };
}

/** Bir sonraki HH:MM (Türkiye saati) için bekleme süresi (ms) — süreç içi zamanlayıcı kullanır. */
export function msUntilNext(hhmm: string, now = new Date()): number {
  const [h, m] = hhmm.split(":").map(Number);
  const today = istanbulDate(now);
  let target = new Date(`${today}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+03:00`);
  if (target.getTime() <= now.getTime()) target = new Date(target.getTime() + 86_400_000);
  return target.getTime() - now.getTime();
}
