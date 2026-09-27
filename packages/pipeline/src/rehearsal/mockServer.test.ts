import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, articles, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { KapAdapter, ResmiGazeteAdapter, StructureError } from "@kaynak/sources";
import { startMockServer, kapNow, type MockServer } from "./mockServer.js";
import { ingestEvents, processPending } from "../pipeline.js";
import { fakeAgents } from "../fakeAgents.js";
import { MemoryStore } from "../storage.js";
import { createAlerter } from "../alerts.js";

let mock: MockServer;
let h: DbHandle;
beforeAll(async () => { mock = await startMockServer(); h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
afterAll(async () => { await mock.close(); await h.close(); });

describe("prova sahte sunucusu", () => {
  it("KAP tarihi biçimi", () => expect(kapNow(new Date("2026-09-27T13:05:09Z"))).toBe("27.09.2026 16:05:09"));

  it("Resmi Gazete: gerçek adapter istenen günün fihristini ve maddelerini alır", async () => {
    const rg = new ResmiGazeteAdapter({ baseUrl: mock.url, now: () => new Date("2026-09-27T09:00:00Z") });
    const evs = await rg.fetchNew(new Date("2026-09-26T12:00:00Z")); // 26 ve 27 Eylül
    expect(evs.map((e) => e.externalId)).toEqual(expect.arrayContaining(["20260926-1", "20260927-4"]));
    const doc = await rg.fetchDocument(evs.find((e) => e.externalId === "20260927-4")!);
    expect(doc.mime).toBe("text/html");
    expect(doc.bytes.toString("utf8")).toMatch(/Sürdürülebilirlik/);
    expect(mock.hits["rg:mukerrer"]).toBeGreaterThan(0);
  });

  it("KAP: tarihler şimdiye çekildiği için son 2 günlük pencereye girer", async () => {
    const kap = new KapAdapter({ baseUrl: mock.url });
    const evs = await kap.fetchNew(new Date(Date.now() - 2 * 86_400_000));
    expect(evs.length).toBeGreaterThan(0);
    expect((await kap.fetchDocument(evs[0]!)).bytes.toString("utf8")).toMatch(/pay/i);
  });

  it("bozuk mod: fihrist yapı hatası verir, normale dönünce düzelir", async () => {
    const rg = new ResmiGazeteAdapter({ baseUrl: mock.url });
    mock.setRg("broken");
    await expect(rg.fetchDay("2026-09-27")).rejects.toBeInstanceOf(StructureError);
    mock.setRg("normal");
    expect(await rg.fetchDay("2026-09-27")).toHaveLength(4);
  });

  it("uçtan uca (süreç içi): ingest → sahte ajan → yayın → Telegram sahte sunucuya düşer", async () => {
    const rg = new ResmiGazeteAdapter({ baseUrl: mock.url });
    const inserted = await ingestEvents(h.db, await rg.fetchDay("2026-09-27"));
    expect(inserted).toHaveLength(4);
    const sent: string[] = [];
    const tg = createAlerter({ TELEGRAM_BOT_TOKEN: "prova", ALERT_TELEGRAM_CHAT_ID: "@kaynak_prova", TELEGRAM_API_BASE: mock.url });
    const out = await processPending({
      db: h.db, agents: fakeAgents, store: new MemoryStore(), reviewThreshold: 4,
      onPublished: async (a) => { sent.push(a.slug); await tg.send(a.title, `${a.dek}\nhttp://site/haber/${a.slug}`); },
    }, rg);
    const kinds = out.map((o) => o.kind).sort();
    expect(kinds.filter((k) => k === "skipped")).toHaveLength(2);
    expect(kinds).toContain("published");
    expect(await h.db.select().from(articles)).not.toHaveLength(0);
    expect(mock.telegram.filter((c) => c.chatId === "@kaynak_prova").map((c) => c.text).join("\n")).toContain(`/haber/${sent[0]}`);
    expect(mock.telegram[0]?.token).toBe("prova");
  });
});
