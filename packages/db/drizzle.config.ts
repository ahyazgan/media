import { defineConfig } from "drizzle-kit";

// Migration üretimi bağlantı gerektirmez; `dbCredentials` yalnızca push/studio için.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://kaynak:kaynak@localhost:5432/kaynak" },
});
