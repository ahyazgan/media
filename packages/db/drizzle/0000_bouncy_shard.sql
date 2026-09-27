CREATE TYPE "public"."article_status" AS ENUM('draft', 'review', 'published', 'corrected', 'retracted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('borsa', 'mevzuat', 'makro', 'bankacilik', 'enerji', 'sirketler', 'diger');--> statement-breakpoint
CREATE TYPE "public"."raw_event_status" AS ENUM('new', 'processed', 'skipped');--> statement-breakpoint
CREATE TABLE "article_versions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"category" "category" NOT NULL,
	"importance" integer NOT NULL,
	"title" text NOT NULL,
	"dek" text NOT NULL,
	"body_markdown" text NOT NULL,
	"key_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tickers" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_url" text NOT NULL,
	"document_id" text,
	"raw_event_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"editor_note" text
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution" text NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"source_url" text,
	"article_id" text
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"kap_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"slug" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "company_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kap_code" text NOT NULL,
	"raw_event_id" text NOT NULL,
	"article_id" text,
	"is_news" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_event_id" text NOT NULL,
	"url" text NOT NULL,
	"mime" text NOT NULL,
	"storage_key" text NOT NULL,
	"text_content" text NOT NULL,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"time_to_publish_p50" real,
	"time_to_publish_p95" real,
	"published" integer DEFAULT 0 NOT NULL,
	"reviewed" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"corrections" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "raw_event_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_queue" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"base_url" text NOT NULL,
	"schedule_cron" text,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_raw_event_id_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_kap_code_companies_kap_code_fk" FOREIGN KEY ("kap_code") REFERENCES "public"."companies"("kap_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_raw_event_id_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_raw_event_id_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_events" ADD CONSTRAINT "raw_events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_versions_unique" ON "article_versions" USING btree ("article_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_slug" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "articles_status_published" ON "articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "articles_category" ON "articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "calendar_events_scheduled" ON "calendar_events" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "documents_raw_event" ON "documents" USING btree ("raw_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_email" ON "newsletter_subscribers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_events_dedupe" ON "raw_events" USING btree ("source_id","external_id","payload_hash");--> statement-breakpoint
CREATE INDEX "raw_events_source_published" ON "raw_events" USING btree ("source_id","published_at");--> statement-breakpoint
CREATE INDEX "raw_events_status" ON "raw_events" USING btree ("status");