CREATE TABLE "source_health" (
	"source_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_items_at" timestamp with time zone,
	"last_fetched" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_error_kind" text,
	"last_error_at" timestamp with time zone,
	"alerted_status" text,
	"alerted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_health" ADD CONSTRAINT "source_health_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;