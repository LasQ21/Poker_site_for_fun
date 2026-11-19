import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { chatMembers, chats, games, players, users, type Game, type User } from "@/lib/db/schema";
import { computeResults } from "@/lib/game/results";
import { computeProfile, type ProfileGameInput, type ProfileStats } from "@/lib/game/profile";
import { badRequest, forbidden, notFound, unauthorized } from "./errors";
import { playerAggregates, toPlayerView } from "./games";
import { chatByPublicId } from "./leaderboard";
import { displayNameOf } from "./users";

export interface ProfileData {
  key: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
  /** Set when the stats cover one group only. */
  chat: { title: string; publicId: string } | null;
  stats: ProfileStats;
}

/** Profile keys mirror leaderboard keys: `u:<telegram id>` or `n:<normalised name>` (players without Telegram). */
export function parseProfileKey(key: string): { userId: number } | { name: string } {
  const u = /^u:(\d{1,20})$/.exec(key);
  if (u) return { userId: Number(u[1]) };
  if (/^n:.{1,40}$/.test(key)) return { name: key.slice(2) };
  throw badRequest("Некоректний профіль");
}

/** Anyone may see their own profile and the profiles of people they share a group or a game with. */
async function canSeeUser(viewerId: number, userId: number) {
  if (viewerId === userId) return true;
  const m1 = alias(chatMembers, "m1");
  const m2 = alias(chatMembers, "m2");
  const [sharedChat] = await db
    .select({ id: m1.chatId })
    .from(m1)
    .innerJoin(m2, eq(m1.chatId, m2.chatId))
    .where(and(eq(m1.userId, viewerId), eq(m2.userId, userId)))
    .limit(1);
  if (sharedChat) return true;
  const p1 = alias(players, "p1");
  const p2 = alias(players, "p2");
  const [sharedGame] = await db
    .select({ id: p1.gameId })
    .from(p1)
    .innerJoin(p2, eq(p1.gameId, p2.gameId))
    .where(and(eq(p1.userId, viewerId), eq(p2.userId, userId)))
    .limit(1);
  return Boolean(sharedGame);
}

async function profileGames(glist: Game[], key: string): Promise<{ inputs: ProfileGameInput[]; lastName: string | null }> {
  const ids = glist.map((g) => g.id);
  if (!ids.length) return { inputs: [], lastName: null };
  const plist = await db.select().from(players).where(inArray(players.gameId, ids));
  const agg = await playerAggregates(ids);
  const chatIds = [...new Set(glist.map((g) => g.chatId).filter((c): c is number => c != null))];
  const chatTitles = new Map(
    chatIds.length ? (await db.select().from(chats).where(inArray(chats.id, chatIds))).map((c) => [c.id, c.title]) : [],
  );
  const inputs: ProfileGameInput[] = [];
  let lastName: string | null = null;
  let lastT = -1;
  for (const g of glist) {
    const gp = plist.filter((p) => p.gameId === g.id);
    const row = computeResults(g, gp.map((p) => toPlayerView(p, agg))).find((r) => r.key === key);
    if (!row) continue;
    inputs.push({
      id: g.id,
      name: g.name,
      type: g.type,
      finishedAt: g.finishedAt,
      chatTitle: g.chatId != null ? (chatTitles.get(g.chatId) ?? null) : null,
      entrants: gp.length,
      row,
    });
    const t = g.finishedAt?.getTime() ?? 0;
    if (t >= lastT) {
      lastT = t;
      lastName = row.displayName;
    }
  }
  return { inputs, lastName };
}

/**
 * Stats of one player. With `chatPublicId` — games of that group only (public, like the group leaderboard);
 * without it — every finished game of a Telegram user (visible to people who play with them).
 */
export async function loadProfile(viewer: User | null, key: string, chatPublicId?: string | null): Promise<ProfileData> {
  const who = parseProfileKey(key);
  const userRow =
    "userId" in who ? (await db.select().from(users).where(eq(users.id, who.userId)).limit(1))[0] : undefined;

  let glist: Game[];
  let chat: ProfileData["chat"] = null;
  if (chatPublicId) {
    const c = await chatByPublicId(chatPublicId);
    chat = { title: c.title, publicId: c.publicId };
    glist = await db
      .select()
      .from(games)
      .where(and(eq(games.chatId, c.id), eq(games.status, "finished")));
  } else {
    if (!("userId" in who)) throw badRequest("Профіль гравця без Telegram доступний лише в межах групи");
    if (!viewer) throw unauthorized();
    if (!(await canSeeUser(viewer.id, who.userId))) throw forbidden("Цей профіль бачать лише ті, хто грає разом");
    const mine = db.select({ id: players.gameId }).from(players).where(eq(players.userId, who.userId));
    glist = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "finished"), inArray(games.id, mine)));
  }

  const { inputs, lastName } = await profileGames(glist, key);
  if (!inputs.length && !userRow) throw notFound("Гравця не знайдено");
  return {
    key,
    name: userRow ? displayNameOf(userRow) : (lastName ?? key.slice(2)),
    username: userRow?.username ?? null,
    photoUrl: userRow?.photoUrl ?? null,
    chat,
    stats: computeProfile(inputs),
  };
}
