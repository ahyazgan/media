import { defineConfig, devices } from "@playwright/test";

/**
 * Uçtan uca duman testleri (üretim derlemesine karşı). Önce `pnpm build`; `pnpm e2e` sunucuyu kendisi başlatır.
 * Tarayıcı: PLAYWRIGHT_BROWSERS_PATH (CI'da `npx playwright install chromium`).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] }, testMatch: /pwa|ads/ },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ADMIN_USER: "e2e", ADMIN_PASSWORD: "e2e-sifre-123", DATABASE_URL: process.env.DATABASE_URL ?? "pglite://./data/kaynak" },
  },
});
