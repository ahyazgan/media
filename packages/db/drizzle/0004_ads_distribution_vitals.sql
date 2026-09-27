CREATE TYPE "public"."distribution_channel" AS ENUM('telegram', 'x', 'push');--> statement-breakpoint
CREATE TABLE "ad_inquiries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"budget" text,
	"formats" text[] DEFAULT '{}'::text[] NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "distribution_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "distribution_channel" NOT NULL,
	"article_id" text NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_vitals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"value" real NOT NULL,
	"rating" text NOT NULL,
	"path" text NOT NULL,
	"mobile" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "distribution_log" ADD CONSTRAINT "distribution_log_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_inquiries_open" ON "ad_inquiries" USING btree ("resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "distribution_log_channel_created" ON "distribution_log" USING btree ("channel","created_at");--> statement-breakpoint
CREATE INDEX "distribution_log_article" ON "distribution_log" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "web_vitals_name_created" ON "web_vitals" USING btree ("name","created_at");