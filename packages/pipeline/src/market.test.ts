import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { syncMarketQuotes, tickerItems, upsertQuotes } from "./market.js";

const json = JSON.parse(readFileSync(new URL("../../sources/fixtures/evds-kurlar.json", import.meta.url), "utf8"));
let h: DbHandle;
beforeAll(async () => { h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
afterAll(async () => { await h.close(); });

describe("piyasa şeridi", () => {
  it("anahtar yoksa atlar; varsa çeker, upsert eder (tekrar koşuda çoğalmaz), şerit değişimi hesaplar", async () => {
    expect(await syncMarketQuotes(h.db, undefined)).toMatchObject({ points: 0 });
    const fetchImpl: typeof fetch = async (input) => String(input).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response(JSON.stringify(json), { status: 200 });
    const r = await syncMarketQuotes(h.db, "k", { fetchImpl, now: new Date("2026-09-26T12:00:00Z") });
    expect(r.points).toBe(12);
    await syncMarketQuotes(h.db, "k", { fetchImpl, now: new Date("2026-09-26T12:00:00Z") });
    const items = await tickerItems(h.db);
    expect(items.map((i) => i.symbol)).toEqual(["USD/TRY", "EUR/TRY", "GBP/TRY"]);
    const usd = items[0]!;
    expect(usd.date).toBe("2026-09-25");
    expect(usd.value).toBe("41,3125");
    expect(usd.change).toBeCloseTo(((41.3125 - 41.2410) / 41.2410) * 100, 2);
    expect(await upsertQuotes(h.db, [{ series: "TP.DK.USD.A", date: "2026-09-25", value: 41.4 }])).toBe(1);
    expect((await tickerItems(h.db))[0]!.value).toBe("41,40");
  });
});
