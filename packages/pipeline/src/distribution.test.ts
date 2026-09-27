import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, articles, calendarEvents, newsletterSubscribers, pushSubscriptions, rawEvents, type Article, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { TcmbAdapter, parseTcmbCalendar, parseTuikCalendar, type SourceAdapter, type RawEvent } from "@kaynak/sources";
import { isCalendarHot, linkCalendarEvent, syncCalendar, upcomingEvents } from "./calendar.js";
import { createMailer } from "./mail.js";
import { composeBulletin, msUntilNext, renderBulletin, sendBulletin } from "./newsletter.js";
import { pushPayload, sendPushForArticle, type PushSender } from "./push.js";
import { makeOnPublished, pathsFor } from "./publish.js";
import { ingestEvents, processPending } from "./pipeline.js";
import { fakeAgents } from "./fakeAgents.js";
import { MemoryStore } from "./storage.js";
import { loadEnv } from "./env.js";

const FX = new URL("../../sources/fixtures/", import.meta.url);
const AG = new URL("../../agents/fixtures/", import.meta.url);
let h: DbHandle;
beforeAll(async () => { h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
afterAll(async () => { await h.close(); });

const NOW = new Date("2026-10-22T13:58:00+03:00"); // PPK günü, 14:00'teki karardan 2 dk önce

describe("takvim", () => {
  it("senkron idempotent; 30 günlük liste; takvim saatinde hot", async () => {
    const entries = [...parseTuikCalendar(readFileSync(new URL("tuik-takvim.html", FX), "utf8")), ...parseTcmbCalendar(readFileSync(new URL("tcmb-ppk-takvim.html", FX), "utf8"), { year: 2026 })];
    expect(await syncCalendar(h.db, entries)).toBe(entries.length);
    expect(await syncCalendar(h.db, entries)).toBe(0);
    const up = await upcomingEvents(h.db, { from: new Date("2026-10-01T00:00:00Z"), days: 30 });
    expect(up.map((e) => e.title)).toContain("Tüketici Fiyat Endeksi");
    expect(up.some((e) => e.scheduledAt > new Date("2026-10-31T00:00:00Z"))).toBe(false);
    expect(await isCalendarHot(h.db, "tcmb", NOW)).toBe(true);
    expect(await isCalendarHot(h.db, "tcmb", new Date("2026-10-22T16:00:00+03:00"))).toBe(false);
    expect(await isCalendarHot(h.db, "tuik", NOW)).toBe(false);
    expect(await isCalendarHot(h.db, "tuik", new Date("2026-10-05T10:10:00+03:00"))).toBe(true);
  });
  it("TCMB haberi yayınlanınca en yakın takvim girdisine bağlanır", async () => {
    const a = new TcmbAdapter({ feedUrl: "https://example.test/rss" });
    const events = a.eventsFromXml(readFileSync(new URL("tcmb-basin.xml", FX), "utf8"));
    await ingestEvents(h.db, events);
    const docFor = (ev: RawEvent) => readFileSync(new URL(`tcmb/${ev.externalId.startsWith("duy2026-38") ? "01-ppk-faiz-karari" : "02-zorunlu-karsilik"}/document.txt`, AG), "utf8");
    const offline: SourceAdapter = { id: "tcmb", official: true, schedule: () => a.schedule(), fetchNew: async () => [], fetchDocument: async (ev: RawEvent) => ({ url: ev.url, mime: "text/html", bytes: Buffer.from(`<html><body><pre>${docFor(ev)}</pre></body></html>`) }) };
    const lowThreshold = await processPending({ db: h.db, agents: fakeAgents, store: new MemoryStore(), reviewThreshold: 6 }, offline);
    expect(lowThreshold.map((o) => o.kind)).toEqual(["published", "published"]);
    const [ppk] = await h.db.select().from(calendarEvents).where(eq(calendarEvents.scheduledAt, new Date("2026-10-22T14:00:00+03:00")));
    expect(ppk?.articleId).toBeTruthy();
    const [art] = await h.db.select().from(articles).where(eq(articles.id, ppk!.articleId!));
    expect(art?.category).toBe("makro");
    expect(art?.tags).toContain("makro");
    expect(pathsFor(art!, "tcmb")).toContain("/takvim");
    // ikinci haber (zorunlu karşılık, 16 Ekim) ±6 saat içinde takvim girdisi olmadığından bağlanmaz
    const linked = await h.db.select().from(calendarEvents).where(eq(calendarEvents.institution, "tcmb"));
    expect(linked.filter((e) => e.articleId).length).toBe(1);
    expect(await linkCalendarEvent(h.db, "tcmb", art!.id, new Date("2026-06-11T14:00:00+03:00"))).toBeTruthy();
  });
});

describe("sabah bülteni", () => {
  it("bugünün takvimi, son 24 saatin en önemli haberleri ve Resmi Gazete ile derlenir", async () => {
    await h.db.insert(rawEvents).values({ sourceId: "resmi-gazete", externalId: "20261022-1", title: "Bir Yönetmelik", url: "https://rg.test/1", publishedAt: new Date("2026-10-22T03:00:00Z"), payloadHash: "h1", payload: { section: "yonetmelik", sectionLabel: "Yönetmelik" } });
    await h.db.update(articles).set({ publishedAt: new Date(NOW.getTime() - 3_600_000) });
    const data = await composeBulletin(h.db, { now: NOW });
    expect(data.gazetteDate).toBe("2026-10-22");
    expect(data.gazette).toHaveLength(1);
    expect(data.calendar.map((e) => e.title)).toEqual(["PPK Toplantısı ve Faiz Kararı"]);
    expect(data.top.length).toBeGreaterThanOrEqual(1);
    expect(data.top[0]!.importance).toBeGreaterThanOrEqual(data.top.at(-1)!.importance);
    const r = renderBulletin(data, "https://kaynak.test", "https://kaynak.test/api/bulten/iptal?token=t");
    expect(r.subject).toMatch(/22 Ekim 2026/);
    expect(r.html).toContain("Abonelikten çık");
    expect(r.text).toContain("PPK Toplantısı ve Faiz Kararı");
    expect(r.text).toContain("https://kaynak.test/haber/");
    expect(r.html).not.toContain("<script");
  });
  it("yalnızca onaylı ve iptal etmemiş abonelere dosya taşıyıcısıyla gönderir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kaynak-mail-"));
    await h.db.insert(newsletterSubscribers).values([
      { email: "onayli@example.com", confirmedAt: new Date() },
      { email: "onaysiz@example.com" },
      { email: "iptal@example.com", confirmedAt: new Date(), unsubscribedAt: new Date() },
    ]);
    const mailer = await createMailer({ SMTP_URL: undefined, MAIL_FROM: "Kaynak <bulten@test>", MAIL_DIR: dir });
    expect(mailer.kind).toBe("file");
    const r = await sendBulletin(h.db, mailer, { SITE_URL: "https://kaynak.test" }, { now: NOW });
    expect(r).toMatchObject({ sent: 1, failed: 0, subscribers: 1 });
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const eml = readFileSync(join(dir, files[0]!), "utf8");
    expect(eml).toContain("To: onayli@example.com");
    expect(eml).toMatch(/List-Unsubscribe: <https:\/\/kaynak\.test\/api\/bulten\/iptal\?token=[0-9a-f-]+>/);
    const [s] = await h.db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, "onayli@example.com"));
    expect(s?.lastSentAt).toBeInstanceOf(Date);
  });
  it("msUntilNext 07:30 Türkiye saatini hedefler", () => {
    expect(msUntilNext("07:30", new Date("2026-10-22T04:00:00Z"))).toBe(30 * 60_000);           // 07:00 TR → 30 dk
    expect(msUntilNext("07:30", new Date("2026-10-22T05:00:00Z"))).toBe(23.5 * 3_600_000);     // 08:00 TR → yarın
  });
});

describe("web push", () => {
  it("kategori aboneliğine göre gönderir; 410 dönen abonelik silinir", async () => {
    await h.db.insert(pushSubscriptions).values([
      { endpoint: "https://push.test/all", keys: { p256dh: "a", auth: "b" }, categories: [] },
      { endpoint: "https://push.test/makro", keys: { p256dh: "a", auth: "b" }, categories: ["makro"] },
      { endpoint: "https://push.test/borsa", keys: { p256dh: "a", auth: "b" }, categories: ["borsa"] },
      { endpoint: "https://push.test/gone", keys: { p256dh: "a", auth: "b" }, categories: ["makro"] },
    ]);
    const sent: string[] = [];
    const sender: PushSender = { async sendNotification(sub, payload) { if (sub.endpoint.endsWith("/gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 }); sent.push(sub.endpoint); JSON.parse(payload); } };
    const [a] = await h.db.select().from(articles).where(eq(articles.category, "makro")).limit(1);
    const r = await sendPushForArticle(h.db, sender, a!, "https://kaynak.test");
    expect(r).toEqual({ sent: 2, removed: 1, failed: 0 });
    expect(sent.sort()).toEqual(["https://push.test/all", "https://push.test/makro"]);
    expect(await h.db.select().from(pushSubscriptions)).toHaveLength(3);
    expect(JSON.parse(pushPayload(a!, "https://kaynak.test"))).toMatchObject({ title: a!.title, url: `https://kaynak.test/haber/${a!.slug}`, category: "makro" });
  });
});

describe("publish kancası", () => {
  it("Telegram'a başlık + dek + link gönderir, revalidate çağırır, eşik altı haberde push atlanır", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => { calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined }); return new Response("{}", { status: 200 }); };
    const env = loadEnv({ TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHANNEL_ID: "@kanal", REVALIDATE_SECRET: "s", SITE_URL: "https://kaynak.test" });
    let pushed = 0;
    const push: PushSender = { async sendNotification() { pushed++; } };
    const on = makeOnPublished(env, { fetchImpl, db: h.db, push });
    const base = (await h.db.select().from(articles).limit(1))[0]!;
    await on({ ...base, importance: 3, title: "Başlık <b>", dek: "Dek" } as Article, { sourceId: "tcmb" });
    const tg = calls.find((c) => c.url.includes("api.telegram.org/bottok/sendMessage"));
    expect(tg?.body).toMatchObject({ chat_id: "@kanal", parse_mode: "HTML" });
    expect((tg?.body as { text: string }).text).toBe(`<b>Başlık &lt;b&gt;</b>\nDek\nhttps://kaynak.test/haber/${base.slug}`);
    const rv = calls.find((c) => c.url.endsWith("/api/revalidate"));
    expect((rv?.body as { paths: string[] }).paths).toEqual(expect.arrayContaining(["/", `/haber/${base.slug}`, "/takvim"]));
    expect(pushed).toBe(0);
    await on({ ...base, importance: 4, category: "makro" } as Article, { sourceId: "tcmb" });
    expect(pushed).toBeGreaterThan(0);
  });
});
