import { round2, type GameType, type ResultRow } from "./results";

/** One finished game from the point of view of a single player. */
export interface ProfileGameInput {
  id: string;
  name: string;
  type: GameType;
  finishedAt: Date | null;
  chatTitle: string | null;
  /** Number of players in the game. */
  entrants: number;
  row: ResultRow;
}

export interface ProfileGame {
  gameId: string;
  name: string;
  type: GameType;
  t: number;
  chatTitle: string | null;
  place: number;
  entrants: number;
  buyinCount: number;
  netChips: number;
  netBuyins: number;
  points: number | null;
}

export interface BestGame {
  gameId: string;
  name: string;
  value: number;
}

export interface ProfileStats {
  games: number;
  wins: number;
  /** Top-3 finishes (cash: top-3 by result). */
  podiums: number;
  /** wins / games, 0..1. */
  winRate: number;
  /** Longest run of consecutive wins. */
  bestWinStreak: number;
  cash: {
    games: number;
    wins: number;
    netChips: number;
    netBuyins: number;
    avgBuyins: number;
    /** Games finished in plus. */
    profitable: number;
    /** Rebuys and add-ons (every buy-in after the first). */
    rebuys: number;
    best: BestGame | null;
    worst: BestGame | null;
  };
  tournament: {
    games: number;
    wins: number;
    podiums: number;
    points: number;
    avgPoints: number;
    avgPlace: number;
    bestPlace: number | null;
    /** How many times each place was taken, place 1..max. */
    placeDist: { place: number; count: number }[];
  };
  /** Cash games in time order with the running total in buy-ins. */
  cashTimeline: (ProfileGame & { cum: number })[];
  /** Tournaments in time order with the running points total. */
  tournamentTimeline: (ProfileGame & { cum: number })[];
  /** All games, newest first. */
  recent: ProfileGame[];
}

const best = (cur: BestGame | null, cand: BestGame, better: (a: number, b: number) => boolean) =>
  !cur || better(cand.value, cur.value) ? cand : cur;

export function computeProfile(input: ProfileGameInput[]): ProfileStats {
  const games: ProfileGame[] = input
    .map((g) => ({
      gameId: g.id,
      name: g.name,
      type: g.type,
      t: g.finishedAt?.getTime() ?? 0,
      chatTitle: g.chatTitle,
      place: g.row.place,
      entrants: g.entrants,
      buyinCount: g.row.buyinCount,
      netChips: g.row.netChips,
      netBuyins: g.row.netBuyins,
      points: g.row.points,
    }))
    .sort((a, b) => a.t - b.t);

  const cash = games.filter((g) => g.type === "cash");
  const tour = games.filter((g) => g.type === "tournament");

  let cum = 0;
  const cashTimeline = cash.map((g) => ({ ...g, cum: (cum = round2(cum + g.netBuyins)) }));
  cum = 0;
  const tournamentTimeline = tour.map((g) => ({ ...g, cum: (cum += g.points ?? 0) }));

  let bestCash: BestGame | null = null;
  let worstCash: BestGame | null = null;
  for (const g of cash) {
    const c = { gameId: g.gameId, name: g.name, value: g.netBuyins };
    bestCash = best(bestCash, c, (a, b) => a > b);
    worstCash = best(worstCash, c, (a, b) => a < b);
  }

  const maxPlace = Math.max(0, ...tour.map((g) => g.place));
  const placeDist = Array.from({ length: maxPlace }, (_, i) => ({
    place: i + 1,
    count: tour.filter((g) => g.place === i + 1).length,
  }));

  let streak = 0;
  let bestWinStreak = 0;
  for (const g of games) {
    streak = g.place === 1 ? streak + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, streak);
  }

  const wins = games.filter((g) => g.place === 1).length;
  const tPoints = tour.reduce((s, g) => s + (g.points ?? 0), 0);
  const cNet = round2(cash.reduce((s, g) => s + g.netBuyins, 0));

  return {
    games: games.length,
    wins,
    podiums: games.filter((g) => g.place <= 3).length,
    winRate: games.length ? round2(wins / games.length) : 0,
    bestWinStreak,
    cash: {
      games: cash.length,
      wins: cash.filter((g) => g.place === 1).length,
      netChips: cash.reduce((s, g) => s + g.netChips, 0),
      netBuyins: cNet,
      avgBuyins: cash.length ? round2(cNet / cash.length) : 0,
      profitable: cash.filter((g) => g.netChips > 0).length,
      rebuys: cash.reduce((s, g) => s + Math.max(0, g.buyinCount - 1), 0),
      best: bestCash,
      worst: worstCash,
    },
    tournament: {
      games: tour.length,
      wins: tour.filter((g) => g.place === 1).length,
      podiums: tour.filter((g) => g.place <= 3).length,
      points: tPoints,
      avgPoints: tour.length ? round2(tPoints / tour.length) : 0,
      avgPlace: tour.length ? round2(tour.reduce((s, g) => s + g.place, 0) / tour.length) : 0,
      bestPlace: tour.length ? Math.min(...tour.map((g) => g.place)) : null,
      placeDist,
    },
    cashTimeline,
    tournamentTimeline,
    recent: [...games].reverse(),
  };
}
