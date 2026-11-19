CREATE TABLE "player_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"name_key" text NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_links" ADD CONSTRAINT "player_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_links_username_idx" ON "player_links" USING btree ("username");--> statement-breakpoint
CREATE INDEX "player_links_name_idx" ON "player_links" USING btree ("name_key");--> statement-breakpoint
INSERT INTO "player_links" ("username", "name_key") VALUES
  ('q4r8t7', 'бодя'),
  ('spchless', 'даня'),
  ('o_panchuk', 'сашко'),
  ('obrkos', 'костя');
