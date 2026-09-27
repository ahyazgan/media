import { expect, test } from "@playwright/test";

test.describe("site", () => {
  test("ana sayfa: masthead, KAP akışı ve takvim blokları", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("masthead")).toBeVisible();
    await expect(page.locator(".k-kap")).toBeVisible();
    await expect(page.locator(".k-cal")).toBeVisible();
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  });
  test("haber sayfası: kaynak belge kutusu ve JSON-LD", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("a[href^='/haber/']").first();
    test.skip((await first.count()) === 0, "yayınlanmış haber yok");
    await first.click();
    await expect(page.locator("h1.k-article__title")).toBeVisible();
    await expect(page.locator(".k-src")).toBeVisible();
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld!)["@type"]).toBe("NewsArticle");
  });
  test("RSS, sitemap'ler ve manifest yanıt verir", async ({ request }) => {
    for (const p of ["/rss.xml", "/sitemap.xml", "/news-sitemap.xml"]) {
      const r = await request.get(p);
      expect(r.status(), p).toBe(200);
      expect(r.headers()["content-type"]).toMatch(/xml/);
    }
    const m = await request.get("/manifest.webmanifest");
    expect(m.status()).toBe(200);
    expect((await m.json()).display).toBe("standalone");
  });
  test("güvenlik başlıkları", async ({ request }) => {
    const r = await request.get("/");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    expect(r.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  });
});

test.describe("admin", () => {
  test("kimliksiz 401, yanlış parola 401, doğru parola 200 + noindex", async ({ request }) => {
    expect((await request.get("/admin")).status()).toBe(401);
    expect((await request.get("/admin", { headers: { authorization: "Basic " + Buffer.from("e2e:yanlis").toString("base64") } })).status()).toBe(401);
    const ok = await request.get("/admin", { headers: { authorization: "Basic " + Buffer.from("e2e:e2e-sifre-123").toString("base64") } });
    expect(ok.status()).toBe(200);
    expect(ok.headers()["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("formlar", () => {
  test("iletişim formu rıza olmadan 400, rızayla 200; bot tuzağı sessizce kabul", async ({ request }) => {
    const bad = await request.post("/api/iletisim", { data: { name: "Ad", email: "a@b.co", message: "on karakterlik mesaj" } });
    expect(bad.status()).toBe(400);
    const ok = await request.post("/api/iletisim", { data: { name: "Ad Soyad", email: "e2e@example.com", message: "E2E testinden gelen düzeltme talebi.", consent: true } });
    expect(ok.status()).toBe(200);
    const bot = await request.post("/api/iletisim", { data: { name: "B", email: "x", message: "y", consent: true, website: "spam" } });
    expect(bot.status()).toBe(200);
  });
});
