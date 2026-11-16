CREATE TYPE "public"."buyin_kind" AS ENUM('buyin', 'rebuy', 'addon');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('active', 'finished');--> statement-breakpoint
CREATE TYPE "public"."game_type" AS ENUM('cash', 'tournament');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('active', 'busted', 'left');--> statement-breakpoint
CREATE TABLE "buyins" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"chips" integer NOT NULL,
	"kind" "buyin_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"chat_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_members_chat_id_user_id_pk" PRIMARY KEY("chat_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" bigint PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chats_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"chat_id" bigint,
	"season_id" integer,
	"host_user_id" bigint NOT NULL,
	"type" "game_type" NOT NULL,
	"status" "game_status" DEFAULT 'active' NOT NULL,
	"starting_stack" integer NOT NULL,
	"blind_structure" jsonb NOT NULL,
	"blind_level" integer DEFAULT 0 NOT NULL,
	"level_started_at" timestamp with time zone,
	"paused_remaining_ms" integer,
	"timer_version" integer DEFAULT 0 NOT NULL,
	"reminder_interval_min" integer,
	"reminder_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"display_name" text NOT NULL,
	"user_id" bigint,
	"status" "player_status" DEFAULT 'active' NOT NULL,
	"finish_place" integer,
	"final_chips" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"busted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stack_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"chips" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" bigint
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"username" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyins" ADD CONSTRAINT "buyins_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyins" ADD CONSTRAINT "buyins_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stack_snapshots" ADD CONSTRAINT "stack_snapshots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stack_snapshots" ADD CONSTRAINT "stack_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyins_game_idx" ON "buyins" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "games_chat_idx" ON "games" USING btree ("chat_id","status");--> statement-breakpoint
CREATE INDEX "games_host_idx" ON "games" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "players_game_idx" ON "players" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "players_user_idx" ON "players" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_game_user_uq" ON "players" USING btree ("game_id","user_id") WHERE "players"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "seasons_chat_idx" ON "seasons" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "snapshots_game_idx" ON "stack_snapshots" USING btree ("game_id","recorded_at");