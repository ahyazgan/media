ALTER TABLE "calendar_events" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "token" text DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_unique" ON "calendar_events" USING btree ("institution","title","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_token" ON "newsletter_subscribers" USING btree ("token");