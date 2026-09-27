import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DbHandle } from "./client.ts";
import { rawEvents, sources, articles } from "./schema.ts";
import { seed } from "./seed.ts";

let h: DbHandle;
beforeAll(async () => {
  h = await createDb("pglite://memory");
  await h.migrate();
  await seed(h.db);
});
afterAll(async () => { await h.close(); });

describe("schema", () => {
  it("seeds sources idempotently", async () => {
    await seed(h.db);
    const rows = await h.db.select().from(sources);
    expect(rows.map((r) => r.id)).toContain("resmi-gazete");
    expect(rows.filter((r) => r.id === "resmi-gazete")).toHaveLength(1);
  });

  it("enforces raw_events dedupe key (sourceId, externalId, payloadHash)", async () => {
    const ev = {
      sourceId: "resmi-gazete", externalId: "20260926-1", title: "Test", url: "https://x/1",
      publishedAt: new Date("2026-09-26T03:00:00Z"), payloadHash: "abc", payload: { section: "yonetmelik" },
    };
    await h.db.insert(rawEvents).values(ev);
    await expect(h.db.insert(rawEvents).values(ev)).rejects.toThrow();
    // Aynı externalId, farklı hash → yeni satır (içerik değişmiş demektir)
    await h.db.insert(rawEvents).values({ ...ev, payloadHash: "def" });
    const rows = await h.db.select().from(rawEvents).where(eq(rawEvents.externalId, "20260926-1"));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe("new");
  });

  it("stores articles with arrays and jsonb", async () => {
    const [a] = await h.db.insert(articles).values({
      slug: "test-haber-abc123", category: "mevzuat", importance: 2, title: "T", dek: "D", bodyMarkdown: "B",
      keyFacts: [{ text: "olgu", quoteFromSource: "alıntı" }], tickers: ["THYAO"], tags: ["yonetmelik"], sourceUrl: "https://x/1",
    }).returning();
    expect(a?.status).toBe("draft");
    expect(a?.keyFacts[0]?.quoteFromSource).toBe("alıntı");
    expect(a?.tickers).toEqual(["THYAO"]);
  });
});
