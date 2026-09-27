import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, articles, distributionLog, type Article, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import { authorizationHeader, percentEncode, sign, signatureBase } from "./oauth1.js";
import { composeTweet, postArticleToX, xPostedToday } from "./x.js";
import { loadEnv } from "./env.js";
import { makeOnPublished } from "./publish.js";

describe("OAuth 1.0a imzası — X belgelerindeki örnek vektör", () => {
  const creds = { consumerKey: "xvz1evFS4wEEPTGEFPHBog", consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", accessSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" };
  const url = "https://api.twitter.com/1.1/statuses/update.json?include_entities=true";
  const body = { status: "Hello Ladies + Gentlemen, a signed OAuth request!" };
  const oauth = { oauth_consumer_key: creds.consumerKey, oauth_nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", oauth_signature_method: "HMAC-SHA1", oauth_timestamp: "1318622958", oauth_token: creds.accessToken, oauth_version: "1.0" };
  it("percent-encoding RFC 3986", () => {
    expect(percentEncode("Hello Ladies + Gentlemen, a signed OAuth request!")).toBe("Hello%20Ladies%20%2B%20Gentlemen%2C%20a%20signed%20OAuth%20request%21");
    expect(percentEncode("Ladies + Gentlemen")).toBe("Ladies%20%2B%20Gentlemen");
    expect(percentEncode("Dogs, Cats & Mice")).toBe("Dogs%2C%20Cats%20%26%20Mice");
    expect(percentEncode("☃")).toBe("%E2%98%83");
  });
  it("imza tabanı ve imza belgelerdeki değerlerle aynı", () => {
    const base = signatureBase("POST", url, { ...body, ...oauth });
    expect(base).toBe("POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521");
    expect(sign(base, creds.consumerSecret, creds.accessSecret)).toBe("hCtSmYh+iHYCEqBWrE7C7hYmtUk=");
  });
  it("Authorization başlığı sıralı ve tırnaklı", () => {
    const h = authorizationHeader(creds, "POST", url, body, { nonce: oauth.oauth_nonce, timestamp: 1318622958 });
    expect(h.startsWith('OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog", oauth_nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"')).toBe(true);
    expect(h).toContain('oauth_version="1.0"');
  });
});

describe("X paylaşımı", () => {
  let h: DbHandle;
  const mk = async (slug: string, importance = 4) => (await h.db.insert(articles).values({ slug, status: "published", category: "makro", importance, title: `Başlık ${slug}`, dek: "Dek metni.", bodyMarkdown: "Gövde", keyFacts: [], sourceUrl: "https://x", publishedAt: new Date() }).returning())[0]!;
  beforeAll(async () => { h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
  afterAll(async () => { await h.close(); });

  it("gönderi metni 280 sınırına uyar (t.co 23 sayılır)", () => {
    const short = composeTweet({ title: "Kısa başlık", dek: "Kısa dek.", slug: "kisa" }, "https://kaynak.test");
    expect(short).toBe("Kısa başlık\nKısa dek.\nhttps://kaynak.test/haber/kisa");
    const long = composeTweet({ title: "B".repeat(300), dek: "d", slug: "uzun" }, "https://kaynak.test");
    const [text, url] = long.split("\n");
    expect(text!.length + 1 + 23).toBeLessThanOrEqual(280);
    expect(text!.endsWith("…")).toBe(true);
    expect(url).toBe("https://kaynak.test/haber/uzun");
  });
  it("anahtar yoksa atlar; eşik altı ve günlük sınır log'a düşer; başarı ve hata kaydedilir; tekrar göndermez", async () => {
    const base = loadEnv({ SITE_URL: "https://kaynak.test" });
    const a = await mk("x-1");
    expect((await postArticleToX(h.db, base, a)).status).toBe("skipped");
    const env = loadEnv({ SITE_URL: "https://kaynak.test", X_CONSUMER_KEY: "k", X_CONSUMER_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts", X_MAX_PER_DAY: "2", X_MIN_IMPORTANCE: "3" });
    const calls: { auth: string; body: string }[] = [];
    let fail = false;
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls.push({ auth: String((init?.headers as Record<string, string>).authorization), body: String(init?.body) });
      return fail ? new Response(JSON.stringify({ title: "Too Many Requests", detail: "rate limited" }), { status: 429 }) : new Response(JSON.stringify({ data: { id: `tw-${calls.length}` } }), { status: 201 });
    };
    const low = await mk("x-low", 2);
    expect((await postArticleToX(h.db, env, low, fetchImpl)).status).toBe("skipped");
    const r1 = await postArticleToX(h.db, env, a, fetchImpl);
    expect(r1).toEqual({ status: "ok", id: "tw-1" });
    expect(calls[0]!.auth).toMatch(/^OAuth oauth_consumer_key="k", oauth_nonce="[0-9a-f]{32}", oauth_signature="[^"]+", oauth_signature_method="HMAC-SHA1", oauth_timestamp="\d+", oauth_token="t", oauth_version="1.0"$/);
    expect(JSON.parse(calls[0]!.body)).toEqual({ text: `Başlık x-1\nDek metni.\nhttps://kaynak.test/haber/x-1` });
    expect((await postArticleToX(h.db, env, a, fetchImpl)).detail).toBe("daha önce gönderildi");
    fail = true;
    const b = await mk("x-2");
    expect((await postArticleToX(h.db, env, b, fetchImpl)).status).toBe("failed");
    fail = false;
    expect((await postArticleToX(h.db, env, b, fetchImpl)).status).toBe("ok");
    expect(await xPostedToday(h.db)).toBe(2);
    const c = await mk("x-3");
    const r3 = await postArticleToX(h.db, env, c, fetchImpl);
    expect(r3.status).toBe("skipped");
    expect(r3.detail).toMatch(/günlük sınır 2/);
    const rows = await h.db.select().from(distributionLog);
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "ok", "ok", "skipped", "skipped"]);
  });
  it("publish kancası X ve Telegram sonuçlarını dağıtım günlüğüne yazar", async () => {
    const env = loadEnv({ SITE_URL: "https://kaynak.test", TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHANNEL_ID: "@k", X_CONSUMER_KEY: "k", X_CONSUMER_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" });
    const fetchImpl: typeof fetch = async (input) => String(input).includes("api.x.com") ? new Response(JSON.stringify({ data: { id: "tw-9" } }), { status: 201 }) : new Response("{}", { status: 200 });
    const a = await mk("hook-1", 5);
    const logs: string[] = [];
    await makeOnPublished(env, { fetchImpl, db: h.db, log: (m) => logs.push(m) })(a as Article, { sourceId: "tcmb" });
    const rows = await h.db.select().from(distributionLog);
    expect(rows.filter((r) => r.articleId === a.id).map((r) => `${r.channel}:${r.status}`).sort()).toEqual(["telegram:ok", "x:ok"]);
    expect(logs).toContain("x");
  });
});
