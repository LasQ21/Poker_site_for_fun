import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { BlindLevel } from "@/lib/game/blinds";

const tgId = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const gameTypeEnum = pgEnum("game_type", ["cash", "tournament"]);
export const gameStatusEnum = pgEnum("game_status", ["active", "finished"]);
export const playerStatusEnum = pgEnum("player_status", ["active", "busted", "left"]);
export const buyinKindEnum = pgEnum("buyin_kind", ["buyin", "rebuy", "addon"]);

export const users = pgTable("users", {
  id: tgId("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  username: text("username"),
  photoUrl: text("photo_url"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const chats = pgTable("chats", {
  id: tgId("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  title: text("title").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: tgId("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: tgId("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.userId] })],
);

export const seasons = pgTable(
  "seasons",
  {
    id: serial("id").primaryKey(),
    chatId: tgId("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsAt: ts("starts_at").notNull().defaultNow(),
    endsAt: ts("ends_at"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("seasons_chat_idx").on(t.chatId)],
);

export const games = pgTable(
  "games",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    chatId: tgId("chat_id").references(() => chats.id, { onDelete: "set null" }),
    seasonId: integer("season_id").references(() => seasons.id, { onDelete: "set null" }),
    hostUserId: tgId("host_user_id")
      .notNull()
      .references(() => users.id),
    type: gameTypeEnum("type").notNull(),
    status: gameStatusEnum("status").notNull().default("active"),
    startingStack: integer("starting_stack").notNull(),
    blindStructure: jsonb("blind_structure").$type<BlindLevel[]>().notNull(),
    blindLevel: integer("blind_level").notNull().default(0),
    levelStartedAt: ts("level_started_at"),
    pausedRemainingMs: integer("paused_remaining_ms"),
    timerVersion: integer("timer_version").notNull().default(0),
    reminderIntervalMin: integer("reminder_interval_min"),
    reminderVersion: integer("reminder_version").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    index("games_chat_idx").on(t.chatId, t.status),
    index("games_host_idx").on(t.hostUserId),
  ],
);

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    userId: tgId("user_id").references(() => users.id, { onDelete: "set null" }),
    status: playerStatusEnum("status").notNull().default("active"),
    finishPlace: integer("finish_place"),
    /** Final chip count confirmed when a game ends (the "final_stacks" of the spec). */
    finalChips: integer("final_chips"),
    createdAt: ts("created_at").notNull().defaultNow(),
    bustedAt: ts("busted_at"),
  },
  (t) => [
    index("players_game_idx").on(t.gameId),
    index("players_user_idx").on(t.userId),
    uniqueIndex("players_game_user_uq")
      .on(t.gameId, t.userId)
      .where(sql`${t.userId} is not null`),
  ],
);

export const buyins = pgTable(
  "buyins",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    chips: integer("chips").notNull(),
    kind: buyinKindEnum("kind").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    createdBy: tgId("created_by"),
  },
  (t) => [index("buyins_game_idx").on(t.gameId)],
);

export const stackSnapshots = pgTable(
  "stack_snapshots",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    chips: integer("chips").notNull(),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
    recordedBy: tgId("recorded_by"),
  },
  (t) => [index("snapshots_game_idx").on(t.gameId, t.recordedAt)],
);

export type User = typeof users.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Buyin = typeof buyins.$inferSelect;
export type StackSnapshot = typeof stackSnapshots.$inferSelect;
