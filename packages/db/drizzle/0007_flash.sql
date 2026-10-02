ALTER TABLE "articles" ADD COLUMN "is_flash" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "pending_draft" jsonb;