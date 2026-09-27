CREATE TYPE "public"."correction_request_kind" AS ENUM('duzeltme', 'tekzip', 'diger');--> statement-breakpoint
CREATE TABLE "correction_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "correction_request_kind" DEFAULT 'duzeltme' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"article_slug" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "job_failures" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" text NOT NULL,
	"raw_event_id" text,
	"source_id" text,
	"error" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "retracted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "auto_published" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "grounding_rejects" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "skipped" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "computed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "job_failures" ADD CONSTRAINT "job_failures_raw_event_id_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correction_requests_open" ON "correction_requests" USING btree ("resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "job_failures_open" ON "job_failures" USING btree ("resolved_at","failed_at");