import { round2, type GameType } from "./results";

/** One finished game from a single player's point of view. */
export interface PlayerGameResult {
  gameId: string;
  gameName: string;
  type: GameType;
  finishedAt: string;
  place: number;
  entrants: number;
  netBuyins: number;
  points: number | null;
  buyinCount: number;
}

export type AchievementId = "first_win" | "hot_streak" | "regular" | "veteran" | "shark" | "comeback" | "hat_trick";

export interface Achievement {
  id: AchievementId;
  achieved: boolean;
  /** Progress towards count-based achievements (current / target). */
  progress?: { current: number; target: number };
}

export interface PlayerStats {
  games: number;
  wins: number;
  /** Sum of net results over all games, in buy-ins. */
  netBuyins: number;
  /** Average place over contested games (see isContested). */
  avgPlace: number | null;
  /** Share of contested games finished "in the money" (cash: in profit, tournament: top third). */
  itmRate: number | null;
  cash: { games: number; netBuyins: number; wins: number };
  tournament: { games: number; wins: number; points: number; avgPlace: number | null; itm: number };
  /** Best good result (see isGoodResult); null when the player never had one. */
  best: { gameId: string; gameName: string; type: GameType; place: number; netBuyins: number; points: number | null } | null;
  /** Last games, newest first. */
  form: { gameId: string; type: GameType; place: number; entrants: number; netBuyins: number; good: boolean }[];
  /** Cumulative result in buy-ins after each game, oldest first. */
  timeline: { t: number; gameId: string; net: number; total: number }[];
  currentStreak: number;
  bestStreak: number;
  achievements: Achievement[];
}

/** Paid places in a home tournament: the top third of the field (at least the winner). */
export function itmPlaces(entrants: number) {
  return Math.max(1, Math.ceil(entrants / 3));
}

/**
 * A game with an actual opponent. Games with fewer than two entrants (a host testing the app, a
 * tournament nobody else joined) still count as games played — in `games`, the net result, the
 * timeline, the form and the games-played achievements — but are ignored for everything that
 * rewards a result: wins, average place, ITM rate, streaks, the best game and the other achievements.
 */
export function isContested(r: Pick<PlayerGameResult, "entrants">) {
  return r.entrants >= 2;
}

/** A "good" game: a contested cash game in profit or a contested tournament finish in the money. */
export function isGoodResult(r: Pick<PlayerGameResult, "type" | "place" | "entrants" | "netBuyins">) {
  if (!isContested(r)) return false;
  return r.type === "cash" ? r.netBuyins > 0 : r.place <= itmPlaces(r.entrants);
}

/**
 * A win: first place in a contested game. Cash games rank by net chips with ties sharing a place, so
 * a cash "win" also needs a profit — when everyone breaks even, nobody won.
 */
export function isWin(r: Pick<PlayerGameResult, "type" | "place" | "entrants" | "netBuyins">) {
  return isContested(r) && r.place === 1 && (r.type === "tournament" || r.netBuyins > 0);
}

const time = (r: PlayerGameResult) => new Date(r.finishedAt).getTime();

export function computePlayerStats(results: PlayerGameResult[], formSize = 10): PlayerStats {
  const games = [...results].sort((a, b) => time(a) - time(b));
  const cash = games.filter((g) => g.type === "cash");
  const tour = games.filter((g) => g.type === "tournament");
  // Games that rank a result (see isContested): solo games are only "played".
  const ranked = games.filter(isContested);
  const rankedTour = ranked.filter((g) => g.type === "tournament");
  const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

  let total = 0;
  const timeline = games.map((g) => {
    total = round2(total + g.netBuyins);
    return { t: time(g), gameId: g.gameId, net: g.netBuyins, total };
  });

  let streak = 0;
  let bestStreak = 0;
  for (const g of ranked) {
    streak = isGoodResult(g) ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }

  // Best game: tournament wins rank by field size, cash games by buy-ins won.
  const score = (g: PlayerGameResult) => (g.type === "tournament" ? (g.place === 1 ? 100 + g.entrants : g.entrants - g.place) : g.netBuyins * 10);
  // Only a good result is worth showing as the best one: a run of losses has no "best game".
  const goodGames = ranked.filter(isGoodResult);
  const bestGame = goodGames.length ? goodGames.reduce((b, g) => (score(g) > score(b) ? g : b)) : null;

  const wins = games.filter(isWin).length;
  const tourWins = tour.filter(isWin).length;
  const count = (id: AchievementId, current: number, target: number): Achievement => ({
    id,
    achieved: current >= target,
    progress: { current: Math.min(current, target), target },
  });

  return {
    games: games.length,
    wins,
    netBuyins: total,
    avgPlace: avg(ranked.map((g) => g.place)),
    itmRate: ranked.length ? round2(ranked.filter(isGoodResult).length / ranked.length) : null,
    cash: { games: cash.length, netBuyins: round2(cash.reduce((s, g) => s + g.netBuyins, 0)), wins: cash.filter(isWin).length },
    tournament: {
      games: tour.length,
      wins: tourWins,
      points: tour.reduce((s, g) => s + (g.points ?? 0), 0),
      avgPlace: avg(rankedTour.map((g) => g.place)),
      itm: tour.filter(isGoodResult).length,
    },
    best: bestGame
      ? {
          gameId: bestGame.gameId,
          gameName: bestGame.gameName,
          type: bestGame.type,
          place: bestGame.place,
          netBuyins: bestGame.netBuyins,
          points: bestGame.points,
        }
      : null,
    form: games
      .slice(-formSize)
      .reverse()
      .map((g) => ({ gameId: g.gameId, type: g.type, place: g.place, entrants: g.entrants, netBuyins: g.netBuyins, good: isGoodResult(g) })),
    timeline,
    currentStreak: streak,
    bestStreak,
    achievements: [
      { id: "first_win", achieved: wins > 0 },
      count("hot_streak", bestStreak, 5),
      count("regular", games.length, 10),
      count("veteran", games.length, 50),
      { id: "shark", achieved: cash.some((g) => isContested(g) && g.netBuyins >= 5) },
      { id: "comeback", achieved: tour.some((g) => isWin(g) && g.buyinCount > 1) },
      count("hat_trick", tourWins, 3),
    ],
  };
}
