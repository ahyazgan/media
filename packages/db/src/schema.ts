import { sql } from "drizzle-orm";
import {
  boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, real,
} from "drizzle-orm/pg-core";

export const rawEventStatus = pgEnum("raw_event_status", ["new", "processed", "skipped"]);
// Şartname: draft|review|published|corrected|retracted. `rejected` eklendi: edit aşamasının
// reddettiği taslaklar ölçüt (numericGroundingCheck red sayısı) için kayıt altında kalmalı.
export const articleStatus = pgEnum("article_status", ["draft", "review", "published", "corrected", "retracted", "rejected"]);
export const category = pgEnum("category", ["borsa", "mevzuat", "makro", "bankacilik", "enerji", "sirketler", "diger"]);

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  official: boolean("official").notNull().default(false),
  baseUrl: text("base_url").notNull(),
  scheduleCron: text("schedule_cron"),
  enabled: boolean("enabled").notNull().default(true),
});

export const rawEvents = pgTable("raw_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: text("source_id").notNull().references(() => sources.id),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  payloadHash: text("payload_hash").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: rawEventStatus("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("raw_events_dedupe").on(t.sourceId, t.externalId, t.payloadHash),
  index("raw_events_source_published").on(t.sourceId, t.publishedAt),
  index("raw_events_status").on(t.status),
]);

export const documents = pgTable("documents", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  rawEventId: text("raw_event_id").notNull().references(() => rawEvents.id),
  url: text("url").notNull(),
  mime: text("mime").notNull(),
  storageKey: text("storage_key").notNull(),
  textContent: text("text_content").notNull(),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("documents_raw_event").on(t.rawEventId)]);

export type KeyFact = { text: string; quoteFromSource: string };

export const articles = pgTable("articles", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull(),
  status: articleStatus("status").notNull().default("draft"),
  category: category("category").notNull(),
  importance: integer("importance").notNull(),
  title: text("title").notNull(),
  dek: text("dek").notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  keyFacts: jsonb("key_facts").$type<KeyFact[]>().notNull().default([]),
  tickers: text("tickers").array().notNull().default(sql`'{}'::text[]`),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  sourceUrl: text("source_url").notNull(),
  documentId: text("document_id").references(() => documents.id),
  rawEventId: text("raw_event_id").references(() => rawEvents.id),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  editorNote: text("editor_note"),
}, (t) => [
  uniqueIndex("articles_slug").on(t.slug),
  index("articles_status_published").on(t.status, t.publishedAt),
  index("articles_category").on(t.category),
]);

export const articleVersions = pgTable("article_versions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: text("article_id").notNull().references(() => articles.id),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("article_versions_unique").on(t.articleId, t.version)]);

export const companies = pgTable("companies", {
  kapCode: text("kap_code").primaryKey(),
  name: text("name").notNull(),
  sector: text("sector"),
  slug: text("slug").notNull(),
  description: text("description"),
}, (t) => [uniqueIndex("companies_slug").on(t.slug)]);

export const companyEvents = pgTable("company_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  kapCode: text("kap_code").notNull().references(() => companies.kapCode),
  rawEventId: text("raw_event_id").notNull().references(() => rawEvents.id),
  articleId: text("article_id").references(() => articles.id),
  isNews: boolean("is_news").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const calendarEvents = pgTable("calendar_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  institution: text("institution").notNull(),
  title: text("title").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sourceUrl: text("source_url"),
  articleId: text("article_id").references(() => articles.id),
}, (t) => [index("calendar_events_scheduled").on(t.scheduledAt)]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  endpoint: text("endpoint").notNull(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("push_subscriptions_endpoint").on(t.endpoint)]);

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("newsletter_subscribers_email").on(t.email)]);

export const reviewQueue = pgTable("review_queue", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: text("article_id").notNull().references(() => articles.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
});

export const metricsDaily = pgTable("metrics_daily", {
  date: date("date").primaryKey(),
  timeToPublishP50: real("time_to_publish_p50"),
  timeToPublishP95: real("time_to_publish_p95"),
  published: integer("published").notNull().default(0),
  reviewed: integer("reviewed").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  corrections: integer("corrections").notNull().default(0),
});

export type Source = typeof sources.$inferSelect;
export type RawEventRow = typeof rawEvents.$inferSelect;
export type NewRawEvent = typeof rawEvents.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
