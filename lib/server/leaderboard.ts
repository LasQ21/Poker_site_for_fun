import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMembers, chats, games, players, seasons, type Chat, type Season } from "@/lib/db/schema";
import { computeLeaderboard, computeResults, type LeaderboardGame, type LeaderboardRow } from "@/lib/game/results";
import { tgApi } from "@/lib/telegram/api";
import { config } from "@/lib/config";
import { badRequest, forbidden, notFound } from "./errors";
import { playerAggregates, toPlayerView } from "./games";

export interface LeaderboardData {
  chat: { title: string; publicId: string };
  seasons: { id: number; name: string; isActive: boolean; startsAt: Date; endsAt: Date | null }[];
  season: { id: number; name: string } | null;
  gamesCount: { cash: number; tournament: number };
  tournament: LeaderboardRow[];
  cash: LeaderboardRow[];
  recent: { id: string; name: string; type: string; finishedAt: Date | null; winner: string | null }[];
}

export async function chatByPublicId(publicId: string): Promise<Chat> {
  const [c] = await db.select().from(chats).where(eq(chats.publicId, publicId)).limit(1);
  if (!c) throw notFound("errors.chatNotFound");
  return c;
}

export async function activeSeason(chatId: number): Promise<Season | null> {
  const [s] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.chatId, chatId), eq(seasons.isActive, true)))
    .orderBy(desc(seasons.startsAt))
    .limit(1);
  return s ?? null;
}

/** `seasonId`: a season id, "current" (active season or all-time if none) or "all". */
export async function loadLeaderboard(chatId: number, seasonId: number | "current" | "all"): Promise<LeaderboardData> {
  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!chat) throw notFound("errors.chatNotFound");
  const allSeasons = await db.select().from(seasons).where(eq(seasons.chatId, chatId)).orderBy(desc(seasons.startsAt));
  let season: Season | null = null;
  if (seasonId === "current") season = allSeasons.find((s) => s.isActive) ?? null;
  else if (seasonId !== "all") season = allSeasons.find((s) => s.id === seasonId) ?? null;

  const glist = await db
    .select()
    .from(games)
    .where(
      and(eq(games.chatId, chatId), eq(games.status, "finished"), season ? eq(games.seasonId, season.id) : undefined),
    )
    .orderBy(desc(games.finishedAt));
  const ids = glist.map((g) => g.id);
  const plist = ids.length ? await db.select().from(players).where(inArray(players.gameId, ids)) : [];
  const agg = await playerAggregates(ids);
  const lbGames: LeaderboardGame[] = glist.map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    finishedAt: g.finishedAt,
    results: computeResults(
      g,
      plist.filter((p) => p.gameId === g.id).map((p) => toPlayerView(p, agg)),
    ),
  }));

  return {
    chat: { title: chat.title, publicId: chat.publicId },
    seasons: allSeasons.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive, startsAt: s.startsAt, endsAt: s.endsAt })),
    season: season ? { id: season.id, name: season.name } : null,
    gamesCount: {
      cash: glist.filter((g) => g.type === "cash").length,
      tournament: glist.filter((g) => g.type === "tournament").length,
    },
    tournament: computeLeaderboard(lbGames, "tournament"),
    cash: computeLeaderboard(lbGames, "cash"),
    recent: lbGames.slice(0, 10).map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      finishedAt: g.finishedAt,
      winner: g.results[0]?.displayName ?? null,
    })),
  };
}

export async function chatsForUser(userId: number) {
  return db
    .select({ id: chats.id, publicId: chats.publicId, title: chats.title })
    .from(chatMembers)
    .innerJoin(chats, eq(chats.id, chatMembers.chatId))
    .where(eq(chatMembers.userId, userId))
    .orderBy(desc(chatMembers.lastSeenAt));
}

export async function isChatMember(chatId: number, userId: number) {
  const [m] = await db
    .select()
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
    .limit(1);
  return Boolean(m);
}

/**
 * Seasons reset the group's leaderboard, so only people running games may manage them: someone who
 * hosted a finished game in this group (any member can create a game, so an empty or deleted one
 * doesn't count), or a Telegram admin of the group.
 */
export async function canManageSeasons(chatId: number, userId: number): Promise<boolean> {
  if (!(await isChatMember(chatId, userId))) return false;
  const [hosted] = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.chatId, chatId), eq(games.hostUserId, userId), eq(games.status, "finished")))
    .limit(1);
  if (hosted) return true;
  const api = tgApi();
  if (!api) return false;
  try {
    const m = await api.getChatMember(chatId, userId);
    return m.status === "creator" || m.status === "administrator";
  } catch {
    return false;
  }
}

async function assertCanManageSeasons(chatId: number, userId: number) {
  if (!(await canManageSeasons(chatId, userId))) {
    throw forbidden("errors.seasonsForbidden");
  }
}

export async function startSeason(chatId: number, userId: number, name: string) {
  await assertCanManageSeasons(chatId, userId);
  const n = name.trim().slice(0, 60);
  if (!n) throw badRequest("errors.seasonNameRequired");
  return db.transaction(async (tx) => {
    await tx
      .update(seasons)
      .set({ isActive: false, endsAt: new Date() })
      .where(and(eq(seasons.chatId, chatId), eq(seasons.isActive, true)));
    const [s] = await tx.insert(seasons).values({ chatId, name: n }).returning();
    return s;
  });
}

export async function endSeason(chatId: number, userId: number) {
  await assertCanManageSeasons(chatId, userId);
  const [s] = await db
    .update(seasons)
    .set({ isActive: false, endsAt: new Date() })
    .where(and(eq(seasons.chatId, chatId), eq(seasons.isActive, true)))
    .returning();
  return s ?? null;
}

/** Fallback HMAC key when no session secret is configured (stable for this server instance only). */
const instanceSecret = randomBytes(32).toString("hex");

/** Opaque, stable replacement for a leaderboard row key (`u:<telegram id>` / `n:<name>`). */
function opaqueKey(key: string) {
  return `x:${createHmac("sha256", config.sessionSecret || instanceSecret).update(`lb:${key}`).digest("base64url").slice(0, 16)}`;
}

/** The leaderboard as seen by someone outside the group: no Telegram ids. */
export function redactLeaderboard(data: LeaderboardData): LeaderboardData {
  const redact = (rows: LeaderboardRow[]) => rows.map((r) => ({ ...r, userId: null, key: opaqueKey(r.key) }));
  return { ...data, tournament: redact(data.tournament), cash: redact(data.cash) };
}
