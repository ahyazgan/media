import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { StructureError, HttpError } from "@kaynak/sources";
import { alertIfNeeded, checkSources, recordWatch, statusOf, summarizeSources } from "./sourceHealth.js";
import { createAlerter, type Alerter } from "./alerts.js";

let h: DbHandle;
beforeAll(async () => { h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
afterAll(async () => { await h.close(); });

function recorder(): Alerter & { sent: string[] } {
  const sent: string[] = [];
  return { channels: ["test"], sent, async send(subject) { sent.push(subject); } };
}
const t = (iso: string) => new Date(iso);
const netErr = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

describe("statusOf", () => {
  const base = { sourceId: "resmi-gazete", consecutiveFailures: 0, lastErrorKind: null, lastItemsAt: t("2026-09-27T06:00:00Z"), lastOkAt: t("2026-09-27T06:00:00Z") };
  it("yapı hatası ilk seferde failing, ağ hatası 3. seferde", () => {
    expect(statusOf({ ...base, consecutiveFailures: 1, lastErrorKind: "structure" })).toBe("failing");
    expect(statusOf({ ...base, consecutiveFailures: 1, lastErrorKind: "tls" })).toBe("failing");
    expect(statusOf({ ...base, consecutiveFailures: 2, lastErrorKind: "network" })).toBe("degraded");
    expect(statusOf({ ...base, consecutiveFailures: 3, lastErrorKind: "network" })).toBe("failing");
  });
  it("kaynağa özgü sessizlik süresi aşılırsa stale", () => {
    expect(statusOf(base, t("2026-09-28T10:00:00Z"))).toBe("ok");      // 28 saat
    expect(statusOf(base, t("2026-09-28T13:00:00Z"))).toBe("stale");   // 31 saat > 30
    expect(statusOf({ ...base, sourceId: "kap" }, t("2026-09-29T13:00:00Z"))).toBe("ok"); // KAP 96 saat tolere eder
    expect(statusOf({ ...base, lastOkAt: null })).toBe("unknown");
  });
});

describe("recordWatch + alertIfNeeded", () => {
  it("yapı hatasında bir kez uyarır, tekrarında susar, 24 saat sonra hatırlatır, düzelince haber verir", async () => {
    const a = recorder();
    let row = await recordWatch(h.db, "resmi-gazete", { ok: true, fetched: 4 }, t("2026-09-27T06:00:00Z"));
    expect(row.status).toBe("ok");
    expect(await alertIfNeeded(h.db, row, a)).toBeNull();

    row = await recordWatch(h.db, "resmi-gazete", { ok: false, error: new StructureError("resmi-gazete", "fihristte hiç madde bağlantısı bulunamadı", "<html>...") }, t("2026-09-27T06:03:00Z"));
    expect(row.status).toBe("failing");
    expect(row.lastErrorKind).toBe("structure");
    expect(row.lastError).toMatch(/madde bağlantısı/);
    expect(await alertIfNeeded(h.db, row, a, t("2026-09-27T06:03:00Z"))).toBe("alerted");

    row = await recordWatch(h.db, "resmi-gazete", { ok: false, error: new StructureError("resmi-gazete", "yine") }, t("2026-09-27T06:06:00Z"));
    expect(await alertIfNeeded(h.db, { ...row, alertedStatus: "failing", alertedAt: t("2026-09-27T06:03:00Z") }, a, t("2026-09-27T06:06:00Z"))).toBeNull();
    expect(await alertIfNeeded(h.db, { ...row, alertedStatus: "failing", alertedAt: t("2026-09-27T06:03:00Z") }, a, t("2026-09-28T07:00:00Z"))).toBe("reminded");

    row = await recordWatch(h.db, "resmi-gazete", { ok: true, fetched: 5 }, t("2026-09-28T07:03:00Z"));
    expect(row.status).toBe("ok");
    expect(row.consecutiveFailures).toBe(0);
    expect(await alertIfNeeded(h.db, row, a, t("2026-09-28T07:03:00Z"))).toBe("recovered");
    expect(a.sent).toHaveLength(3);
    expect(a.sent[0]).toMatch(/BOZUK/);
    expect(a.sent[2]).toMatch(/yeniden çalışıyor/);
  });

  it("geçici ağ hataları üçüncüye kadar uyarı üretmez", async () => {
    const a = recorder();
    await recordWatch(h.db, "kap", { ok: true, fetched: 2 }, t("2026-09-27T07:00:00Z"));
    for (let i = 1; i <= 3; i++) {
      const row = await recordWatch(h.db, "kap", { ok: false, error: i === 2 ? new HttpError(503, "https://kap") : netErr() }, t(`2026-09-27T07:0${i}:00Z`));
      const res = await alertIfNeeded(h.db, row, a, t(`2026-09-27T07:0${i}:00Z`));
      expect(res).toBe(i < 3 ? null : "alerted");
    }
    expect(a.sent).toEqual(["🔴 kap: BOZUK"]);
  });

  it("checkSources tarama olmadan bayatlığı yakalar; summarizeSources ok=false döner", async () => {
    const a = recorder();
    await recordWatch(h.db, "tcmb", { ok: true, fetched: 1 }, t("2026-09-01T09:00:00Z"));
    const res = await checkSources(h.db, ["tcmb"], a, t("2026-09-27T09:00:00Z")); // 26 gün > 14 gün
    expect(res).toEqual([{ sourceId: "tcmb", status: "stale", alert: "alerted" }]);
    expect(a.sent[0]).toMatch(/SESSİZ/);
    const rows = await h.db.query.sourceHealth.findMany();
    const rep = summarizeSources(rows, ["tcmb", "tuik"], t("2026-09-27T09:00:00Z"));
    expect(rep.ok).toBe(false);
    expect(rep.sources.find((s) => s.sourceId === "tuik")?.status).toBe("unknown"); // hiç taranmamış kaynak sağlığı bozmaz
    expect(summarizeSources([], ["tuik"]).ok).toBe(true);
  });
});

describe("createAlerter", () => {
  it("Telegram sohbetine gönderir; kanal yoksa sessiz", async () => {
    const calls: string[] = [];
    const f = (async (url: string | URL | Request, init?: RequestInit) => { calls.push(`${String(url)} ${String(init?.body)}`); return new Response("{}"); }) as typeof fetch;
    const tg = createAlerter({ TELEGRAM_BOT_TOKEN: "T", ALERT_TELEGRAM_CHAT_ID: "42" }, undefined, f);
    expect(tg.channels).toEqual(["telegram"]);
    await tg.send("🔴 kap: BOZUK", "ayrıntı");
    expect(calls[0]).toMatch(/botT\/sendMessage/);
    expect(calls[0]).toMatch(/"chat_id":"42"/);
    const none = createAlerter({}, undefined, f);
    expect(none.channels).toEqual([]);
    await none.send("x", "y");
    expect(calls).toHaveLength(1);
  });
});
