CREATE TABLE "market_quotes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series" text NOT NULL,
	"date" date NOT NULL,
	"value" real NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "market_quotes_unique" ON "market_quotes" USING btree ("series","date");--> statement-breakpoint
CREATE INDEX "market_quotes_series_date" ON "market_quotes" USING btree ("series","date");