ALTER TABLE "companies" ADD COLUMN "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "company_events_unique" ON "company_events" USING btree ("kap_code","raw_event_id");--> statement-breakpoint
CREATE INDEX "company_events_code_created" ON "company_events" USING btree ("kap_code","created_at");