import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, playerLinks, players, users, type User } from "@/lib/db/schema";

/** Same normalisation as leaderboard name keys. */
export function nameKeyOf(displayName: string) {
  return displayName.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Accepts "@name", "name", "t.me/name" or "https://t.me/name"; returns the lowercase username or null. */
export function normalizeUsername(input: string): string | null {
  const s = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?(t|telegram)\.me\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
  return /^[a-z][a-z0-9_]{3,31}$/.test(s) ? s : null;
}

/**
 * Hands every name-only seat matching the user's links to that user (seats in games where they
 * already play are skipped). Cheap no-op for users without a username or without links.
 */
export async function claimSeatsForUser(user: Pick<User, "id" | "username">): Promise<number> {
  const username = user.username?.toLowerCase();
  if (!username) return 0;
  const links = await db.select().from(playerLinks).where(eq(playerLinks.username, username));
  if (!links.length) return 0;

  const keys = [...new Set(links.map((l) => l.nameKey))];
  const candidates = await db
    .select({ id: players.id, gameId: players.gameId, displayName: players.displayName, hostUserId: games.hostUserId })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .where(and(isNull(players.userId), inArray(sql`lower(regexp_replace(trim(${players.displayName}), '\\s+', ' ', 'g'))`, keys)));
  if (!candidates.length) return 0;

  const mine = new Set(
    (await db.select({ gameId: players.gameId }).from(players).where(eq(players.userId, user.id))).map((r) => r.gameId),
  );
  let claimed = 0;
  for (const c of candidates) {
    if (mine.has(c.gameId)) continue;
    const key = nameKeyOf(c.displayName);
    const applies = links.some((l) => l.nameKey === key && (l.createdBy == null || l.createdBy === c.hostUserId));
    if (!applies) continue;
    const [done] = await db
      .update(players)
      .set({ userId: user.id })
      .where(and(eq(players.id, c.id), isNull(players.userId)))
      .returning({ id: players.id });
    if (done) {
      mine.add(c.gameId);
      claimed++;
    }
  }
  return claimed;
}

/** Host links a name to a Telegram username for all their games; seats are claimed right away if the user is known. */
export async function addPlayerLink(hostId: number, displayName: string, usernameInput: string) {
  const username = normalizeUsername(usernameInput);
  if (!username) return null;
  const nameKey = nameKeyOf(displayName);
  const [existing] = await db
    .select()
    .from(playerLinks)
    .where(and(eq(playerLinks.nameKey, nameKey), eq(playerLinks.createdBy, hostId)))
    .limit(1);
  if (existing) await db.update(playerLinks).set({ username }).where(eq(playerLinks.id, existing.id));
  else await db.insert(playerLinks).values({ username, nameKey, createdBy: hostId });
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);
  return { username, claimed: user ? await claimSeatsForUser(user) : 0 };
}

/** Username a name-only seat will be handed to, per game host (for showing it in the app). */
export async function pendingLinks(hostId: number, names: string[]): Promise<Map<string, string>> {
  const keys = [...new Set(names.map(nameKeyOf))];
  if (!keys.length) return new Map();
  const rows = await db
    .select()
    .from(playerLinks)
    .where(and(inArray(playerLinks.nameKey, keys), or(isNull(playerLinks.createdBy), eq(playerLinks.createdBy, hostId))));
  const out = new Map<string, string>();
  // The host's own link wins over a global one.
  for (const r of rows.sort((a, b) => Number(a.createdBy != null) - Number(b.createdBy != null))) out.set(r.nameKey, r.username);
  return out;
}
