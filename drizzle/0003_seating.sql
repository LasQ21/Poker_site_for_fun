ALTER TABLE "games" ADD COLUMN "tables" jsonb;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "table_no" integer;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "seat_no" integer;