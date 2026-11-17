import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, players } from "@/lib/db/schema";
import { computeResults } from "@/lib/game/results";
import { computePlayerStats, type PlayerGameResult, type PlayerStats } from "@/lib/game/stats";
import { playerAggregates, toPlayerView } from "./games";

/** Results of every finished game the user played (seat linked to their Telegram account). */
export async function playerGameResults(userId: number): Promise<PlayerGameResult[]> {
  const mine = db.select({ id: players.gameId }).from(players).where(eq(players.userId, userId));
  const glist = await db
    .select()
    .from(games)
    .where(and(eq(games.status, "finished"), inArray(games.id, mine)));
  if (!glist.length) return [];
  const ids = glist.map((g) => g.id);
  const [plist, agg] = await Promise.all([
    db.select().from(players).where(inArray(players.gameId, ids)),
    playerAggregates(ids),
  ]);
  const out: PlayerGameResult[] = [];
  for (const g of glist) {
    const gp = plist.filter((p) => p.gameId === g.id);
    const results = computeResults(g, gp.map((p) => toPlayerView(p, agg)));
    const me = results.find((r) => r.userId === userId);
    if (!me) continue;
    out.push({
      gameId: g.id,
      gameName: g.name,
      type: g.type,
      finishedAt: (g.finishedAt ?? g.updatedAt).toISOString(),
      place: me.place,
      entrants: results.length,
      netBuyins: me.netBuyins,
      points: me.points,
      buyinCount: me.buyinCount,
    });
  }
  return out;
}

export async function loadPlayerStats(userId: number): Promise<PlayerStats> {
  return computePlayerStats(await playerGameResults(userId));
}
