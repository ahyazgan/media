import { config as loadDotenv } from "dotenv";
import { join } from "node:path";
import { findRepoRoot, resolveFromRoot } from "@kaynak/db";
import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().default("pglite://./data/kaynak"),
  REDIS_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  MODEL_CLASSIFY: z.string().default("claude-haiku-4-5"),
  MODEL_WRITE: z.string().default("claude-sonnet-5"),
  REVIEW_THRESHOLD: z.coerce.number().int().min(1).max(6).default(4),
  SITE_URL: z.string().default("http://localhost:3000"),
  REVALIDATE_SECRET: z.string().optional(),
  BOT_CONTACT_EMAIL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  INDEXNOW_KEY: z.string().optional(),
  STORAGE_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  loadDotenv({ path: join(findRepoRoot(), ".env"), quiet: true });
  const raw: Record<string, string | undefined> = { ...process.env, ...overrides };
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const env = Env.parse(raw);
  env.STORAGE_DIR = resolveFromRoot(env.STORAGE_DIR);
  return env;
}
