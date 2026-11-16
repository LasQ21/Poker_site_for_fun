export type GameType = "cash" | "tournament";
export type PlayerStatus = "active" | "busted" | "left";

export interface ResultPlayerInput {
  id: number;
  displayName: string;
  userId: number | null;
  status: PlayerStatus;
  finishPlace: number | null;
  finalChips: number | null;
  currentChips: number;
  buyinChips: number;
  buyinCount: number;
}

export interface ResultRow {
  playerId: number;
  key: string;
  displayName: string;
  userId: number | null;
  buyinChips: number;
  buyinCount: number;
  finalChips: number;
  netChips: number;
  /** Net result expressed in starting stacks ("buy-ins won/lost"). */
  netBuyins: number;
  place: number;
  /** Season points (tournaments only, null for cash). */
  points: number | null;
}

/** Bonus points for winning a tournament on top of `N - place + 1`. */
export const FIRST_PLACE_BONUS = 2;

export function tournamentPoints(place: number, entrants: number, firstBonus = FIRST_PLACE_BONUS): number {
  if (place < 1 || entrants < 1) return 0;
  return Math.max(0, entrants - place + 1) + (place === 1 ? firstBonus : 0);
}

export function playerKey(userId: number | null, displayName: string): string {
  return userId != null ? `u:${userId}` : `n:${displayName.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Place a player gets when busting now, given how many players are still active (including them). */
export function bustPlace(activeCount: number) {
  return Math.max(1, activeCount);
}

export function computeResults(
  game: { type: GameType; startingStack: number },
  players: ResultPlayerInput[],
): ResultRow[] {
  const stack = Math.max(1, game.startingStack);
  const base = players.map((p) => {
    const finalChips = game.type === "cash" ? (p.finalChips ?? p.currentChips) : p.currentChips;
    const netChips = finalChips - p.buyinChips;
    return {
      playerId: p.id,
      key: playerKey(p.userId, p.displayName),
      displayName: p.displayName,
      userId: p.userId,
      buyinChips: p.buyinChips,
      buyinCount: p.buyinCount,
      finalChips,
      netChips,
      netBuyins: round2(netChips / stack),
      place: 0,
      points: null as number | null,
      _p: p,
    };
  });

  if (game.type === "cash") {
    base.sort((a, b) => b.netChips - a.netChips || a.displayName.localeCompare(b.displayName));
    let place = 0;
    base.forEach((r, i) => {
      if (i === 0 || r.netChips !== base[i - 1].netChips) place = i + 1;
      r.place = place;
    });
  } else {
    // Players without a recorded place (still in) rank above busted ones, by chips.
    const placed = base.filter((r) => r._p.finishPlace != null);
    const unplaced = base
      .filter((r) => r._p.finishPlace == null)
      .sort((a, b) => b.finalChips - a.finalChips || a.displayName.localeCompare(b.displayName));
    const taken = new Set(placed.map((r) => r._p.finishPlace!));
    let next = 1;
    for (const r of unplaced) {
      while (taken.has(next)) next++;
      r.place = next;
      taken.add(next);
    }
    for (const r of placed) r.place = r._p.finishPlace!;
    const n = base.length;
    for (const r of base) r.points = tournamentPoints(r.place, n);
    base.sort((a, b) => a.place - b.place);
  }

  return base.map(({ _p, ...r }) => {
    void _p;
    return r;
  });
}

export interface ChipCheck {
  totalStacks: number;
  totalBuyins: number;
  diff: number;
}

/** Chips on the table must equal chips bought in; a non-zero diff means someone mistyped a stack. */
export function chipCheck(players: { currentChips: number; buyinChips: number }[]): ChipCheck {
  const totalStacks = players.reduce((s, p) => s + p.currentChips, 0);
  const totalBuyins = players.reduce((s, p) => s + p.buyinChips, 0);
  return { totalStacks, totalBuyins, diff: totalStacks - totalBuyins };
}

export interface LeaderboardGame {
  id: string;
  name: string;
  type: GameType;
  finishedAt: Date | null;
  results: ResultRow[];
}

export interface LeaderboardRow {
  key: string;
  displayName: string;
  userId: number | null;
  games: number;
  wins: number;
  points: number;
  netChips: number;
  netBuyins: number;
  avgPlace: number;
  /** Average net result per game in buy-ins (cash) — or average points (tournaments). */
  avgResult: number;
  bestGame: { gameId: string; gameName: string; value: number } | null;
}

export function computeLeaderboard(games: LeaderboardGame[], type: GameType): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow & { placeSum: number }>();
  const sorted = [...games]
    .filter((g) => g.type === type)
    .sort((a, b) => (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0));

  for (const g of sorted) {
    for (const r of g.results) {
      let row = rows.get(r.key);
      if (!row) {
        row = {
          key: r.key,
          displayName: r.displayName,
          userId: r.userId,
          games: 0,
          wins: 0,
          points: 0,
          netChips: 0,
          netBuyins: 0,
          avgPlace: 0,
          avgResult: 0,
          bestGame: null,
          placeSum: 0,
        };
        rows.set(r.key, row);
      }
      row.displayName = r.displayName; // latest name wins
      row.games += 1;
      if (r.place === 1) row.wins += 1;
      row.points += r.points ?? 0;
      row.netChips += r.netChips;
      row.netBuyins = round2(row.netBuyins + r.netBuyins);
      row.placeSum += r.place;
      const value = type === "cash" ? r.netBuyins : (r.points ?? 0);
      if (!row.bestGame || value > row.bestGame.value) {
        row.bestGame = { gameId: g.id, gameName: g.name, value };
      }
    }
  }

  const out = [...rows.values()].map(({ placeSum, ...r }) => ({
    ...r,
    avgPlace: round2(placeSum / r.games),
    avgResult: round2(type === "cash" ? r.netBuyins / r.games : r.points / r.games),
  }));
  out.sort((a, b) =>
    type === "cash"
      ? b.netBuyins - a.netBuyins || b.wins - a.wins
      : b.points - a.points || b.wins - a.wins || a.avgPlace - b.avgPlace,
  );
  return out;
}
