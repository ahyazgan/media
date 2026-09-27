import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "db", root: "./packages/db", include: ["src/**/*.test.ts"] } },
      { test: { name: "agents", root: "./packages/agents", include: ["src/**/*.test.ts", "test/**/*.test.ts"], testTimeout: 120_000 } },
      { test: { name: "sources", root: "./packages/sources", include: ["src/**/*.test.ts"] } },
      { test: { name: "pipeline", root: "./packages/pipeline", include: ["src/**/*.test.ts"], testTimeout: 60_000 } },
    ],
  },
});
