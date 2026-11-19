import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMembers, chats, games, players, seasons, users, type Chat, type Game, type Season } from "@/lib/db/schema";
import { computeLeaderboard, computeResults, type LeaderboardGame, type LeaderboardRow } from "@/lib/game/results";
import { badRequest, forbidden, notFound } from "./errors";
import { playerAggregates, toPlayerView } from "./games";

/** Leaderboard row with the player's Telegram identity (for linked players). */
export type LeaderboardEntry = LeaderboardRow & { username: string | null; photoUrl: string | null };

export interface LeaderboardData {
  /** null = the viewer's circle: every game they played, hosted or that belongs to their groups. */
  chat: { title: string; publicId: string } | null;
  seasons: { id: number; name: string; isActive: boolean; startsAt: Date; endsAt: Date | null }[];
  season: { id: number; name: string } | null;
  gamesCount: { cash: number; tournament: number };
  tournament: LeaderboardEntry[];
  cash: LeaderboardEntry[];
  recent: { id: string; name: string; type: string; finishedAt: Date | null; winner: string | null }[];
}

export async function chatByPublicId(publicId: string): Promise<Chat> {
  const [c] = await db.select().from(chats).where(eq(chats.publicId, publicId)).limit(1);
  if (!c) throw notFound("Групу не знайдено");
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
  if (!chat) throw notFound("Групу не знайдено");
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
  return {
    chat: { title: chat.title, publicId: chat.publicId },
    seasons: allSeasons.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive, startsAt: s.startsAt, endsAt: s.endsAt })),
    season: season ? { id: season.id, name: season.name } : null,
    ...(await buildBoard(glist)),
  };
}

/** Leaderboard of everyone the user plays with: their games, games they hosted and their groups' games. */
export async function loadCircleLeaderboard(userId: number): Promise<LeaderboardData> {
  const memberChats = db.select({ id: chatMembers.chatId }).from(chatMembers).where(eq(chatMembers.userId, userId));
  const played = db.select({ id: players.gameId }).from(players).where(eq(players.userId, userId));
  const glist = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.status, "finished"),
        or(eq(games.hostUserId, userId), inArray(games.id, played), inArray(games.chatId, memberChats)),
      ),
    )
    .orderBy(desc(games.finishedAt));
  return { chat: null, seasons: [], season: null, ...(await buildBoard(glist)) };
}

async function buildBoard(glist: Game[]) {
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
  const userIds = [...new Set(plist.map((p) => p.userId).filter((u): u is number => u != null))];
  const tg = new Map(
    userIds.length
      ? (await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u])
      : [],
  );
  const enrich = (rows: LeaderboardRow[]): LeaderboardEntry[] =>
    rows.map((r) => {
      const u = r.userId != null ? tg.get(r.userId) : undefined;
      return { ...r, username: u?.username ?? null, photoUrl: u?.photoUrl ?? null };
    });
  return {
    gamesCount: {
      cash: glist.filter((g) => g.type === "cash").length,
      tournament: glist.filter((g) => g.type === "tournament").length,
    },
    tournament: enrich(computeLeaderboard(lbGames, "tournament")),
    cash: enrich(computeLeaderboard(lbGames, "cash")),
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

export async function startSeason(chatId: number, userId: number, name: string) {
  if (!(await isChatMember(chatId, userId))) throw forbidden("Ви не учасник цієї групи");
  const n = name.trim().slice(0, 60);
  if (!n) throw badRequest("Вкажіть назву сезону");
  await db
    .update(seasons)
    .set({ isActive: false, endsAt: new Date() })
    .where(and(eq(seasons.chatId, chatId), eq(seasons.isActive, true)));
  const [s] = await db.insert(seasons).values({ chatId, name: n }).returning();
  return s;
}

export async function endSeason(chatId: number, userId: number) {
  if (!(await isChatMember(chatId, userId))) throw forbidden("Ви не учасник цієї групи");
  const [s] = await db
    .update(seasons)
    .set({ isActive: false, endsAt: new Date() })
    .where(and(eq(seasons.chatId, chatId), eq(seasons.isActive, true)))
    .returning();
  return s ?? null;
}
