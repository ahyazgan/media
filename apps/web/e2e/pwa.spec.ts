import { expect, test } from "@playwright/test";

test.describe("PWA ve rıza", () => {
  test("service worker kurulur; rıza öncesi reklam isteği yok; kutu boyutu sabit", async ({ page, context }) => {
    const adRequests: string[] = [];
    page.on("request", (r) => { if (/googlesyndication|doubleclick/.test(r.url())) adRequests.push(r.url()); });
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    const reg = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? null);
    expect(reg).toContain("/sw.js");
    const box = page.locator('[data-ad-slot="home-top"] .k-ad__box');
    const before = await box.boundingBox();
    expect(before?.width).toBeGreaterThan(0);
    await expect(page.locator(".k-cookie")).toBeVisible();
    expect(adRequests).toHaveLength(0);
    await page.click(".k-cookie .k-btn--ghost"); // Sadece zorunlu
    await page.waitForTimeout(800);
    expect(adRequests).toHaveLength(0);
    const after = await box.boundingBox();
    expect(after?.height).toBe(before?.height);
    await expect(page.locator(".k-cookie")).toHaveCount(0);
    await context.close();
  });
  test("çevrimdışı geri dönüş sayfası precache'te", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => { const keys = await caches.keys(); const c = keys.find((k) => k.includes("precache")); if (!c) return false; const cache = await caches.open(c); const hit = await cache.match("/~offline", { ignoreSearch: true }); return Boolean(hit); }, null, { timeout: 15_000 });
  });
  test("mobilde kurulum bandı yalnızca iOS'ta çıkar (Pixel'de yok)", async ({ page }) => {
    await page.goto("/");
    await page.click(".k-cookie .k-btn--ghost");
    await page.waitForTimeout(500);
    await expect(page.locator(".k-install")).toHaveCount(0);
  });
});
