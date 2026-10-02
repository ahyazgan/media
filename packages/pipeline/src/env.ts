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
  /** Kaynak alarmları: e-posta (SMTP_URL gerekir) ve/veya Telegram sohbeti (TELEGRAM_BOT_TOKEN ile; kanal değil, editör sohbeti) */
  ALERT_EMAIL: z.string().optional(),
  /** Hazırlık ortamı / prova: kaynak ve Telegram adreslerini sahte sunucuya yönlendirme, sabit tarama aralığı */
  RG_BASE_URL: z.string().optional(),
  KAP_BASE_URL: z.string().optional(),
  TELEGRAM_API_BASE: z.string().default("https://api.telegram.org"),
  WATCH_EVERY_SECONDS: z.coerce.number().int().positive().optional(),
  ALERT_TELEGRAM_CHAT_ID: z.string().optional(),
  INDEXNOW_KEY: z.string().optional(),
  EVDS_API_KEY: z.string().optional(),
  // Faz 3 — push, e-posta, takvim
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  PUSH_MIN_IMPORTANCE: z.coerce.number().int().min(1).max(6).default(4),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("Kaynak <bulten@example.com>"),
  MAIL_DIR: z.string().default("./storage/mail"),
  BULLETIN_TIME: z.string().regex(/^\d{2}:\d{2}$/).default("07:30"),
  // Bülten sponsorluğu ("Sponsorlu" etiketli üst blok); üçü de doluysa gösterilir
  BULLETIN_SPONSOR_NAME: z.string().optional(),
  BULLETIN_SPONSOR_TEXT: z.string().optional(),
  BULLETIN_SPONSOR_URL: z.string().url().optional(),
  // Faz 5 — X paylaşımı (yalnızca resmi hesap; günde en fazla 30)
  X_CONSUMER_KEY: z.string().optional(),
  X_CONSUMER_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),
  X_MAX_PER_DAY: z.coerce.number().int().min(0).max(30).default(30),
  X_MIN_IMPORTANCE: z.coerce.number().int().min(1).max(6).default(3),
  TCMB_FEED_URL: z.string().optional(),
  /** TÜİK veri portalı (JSON API); varsayılan https://veriportali.tuik.gov.tr */
  TUIK_BASE_URL: z.string().optional(),
  TCMB_CALENDAR_URL: z.string().optional(),
  TUIK_CALENDAR_URL: z.string().optional(),
  STORAGE_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_PREFIX: z.string().optional(),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  loadDotenv({ path: join(findRepoRoot(), ".env"), quiet: true });
  const raw: Record<string, string | undefined> = { ...process.env, ...overrides };
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const env = Env.parse(raw);
  env.STORAGE_DIR = resolveFromRoot(env.STORAGE_DIR);
  env.MAIL_DIR = resolveFromRoot(env.MAIL_DIR);
  return env;
}
