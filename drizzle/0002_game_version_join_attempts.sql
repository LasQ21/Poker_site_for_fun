CREATE TABLE "join_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stack_snapshots" ALTER COLUMN "recorded_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "join_attempts_user_idx" ON "join_attempts" USING btree ("user_id","created_at");