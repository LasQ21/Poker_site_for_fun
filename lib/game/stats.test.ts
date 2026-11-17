import { describe, expect, it } from "vitest";
import { computePlayerStats, isGoodResult, isWin, itmPlaces, type PlayerGameResult } from "./stats";

let n = 0;
const g = (p: Partial<PlayerGameResult>): PlayerGameResult => {
  n++;
  return {
    gameId: `g${n}`,
    gameName: `Game ${n}`,
    type: "cash",
    finishedAt: new Date(Date.UTC(2026, 0, n)).toISOString(),
    place: 2,
    entrants: 6,
    netBuyins: 0,
    points: null,
    buyinCount: 1,
    ...p,
  };
};

describe("player stats", () => {
  it("defines the money places and good results", () => {
    expect([2, 3, 4, 6, 9, 10].map(itmPlaces)).toEqual([1, 1, 2, 2, 3, 4]);
    expect(isGoodResult({ type: "tournament", place: 2, entrants: 6, netBuyins: -1 })).toBe(true);
    expect(isGoodResult({ type: "tournament", place: 3, entrants: 6, netBuyins: 0 })).toBe(false);
    expect(isGoodResult({ type: "cash", place: 4, entrants: 6, netBuyins: 0.5 })).toBe(true);
  });

  it("is empty without games", () => {
    const s = computePlayerStats([]);
    expect(s).toMatchObject({ games: 0, wins: 0, netBuyins: 0, avgPlace: null, itmRate: null, best: null, form: [], timeline: [] });
    expect(s.achievements.every((a) => !a.achieved)).toBe(true);
  });

  it("aggregates cash and tournaments, timeline and streaks", () => {
    const list = [
      g({ netBuyins: 1.5, place: 1 }),
      g({ type: "tournament", place: 1, entrants: 5, points: 7, netBuyins: 4, buyinCount: 2 }),
      g({ netBuyins: -2, place: 5 }),
      g({ netBuyins: 5.25, place: 1 }),
      g({ type: "tournament", place: 2, entrants: 5, points: 4, netBuyins: -1 }),
    ];
    const s = computePlayerStats([...list].reverse());
    expect(s.games).toBe(5);
    expect(s.wins).toBe(3);
    expect(s.netBuyins).toBe(7.75);
    expect(s.cash).toEqual({ games: 3, netBuyins: 4.75, wins: 2 });
    expect(s.tournament).toEqual({ games: 2, wins: 1, points: 11, avgPlace: 1.5, itm: 2 });
    expect(s.itmRate).toBe(0.8);
    expect(s.timeline.map((t) => t.total)).toEqual([1.5, 5.5, 3.5, 8.75, 7.75]);
    expect(s.form[0].gameId).toBe(list[4].gameId);
    expect(s.bestStreak).toBe(2);
    expect(s.currentStreak).toBe(2);
    expect(s.best?.gameId).toBe(list[1].gameId);
    const got = Object.fromEntries(s.achievements.map((a) => [a.id, a.achieved]));
    expect(got).toMatchObject({ first_win: true, shark: true, comeback: true, hot_streak: false, hat_trick: false });
    expect(s.achievements.find((a) => a.id === "regular")?.progress).toEqual({ current: 5, target: 10 });
  });

  it("counts a five-game streak in profit", () => {
    const s = computePlayerStats(Array.from({ length: 6 }, (_, i) => g({ netBuyins: i === 0 ? -1 : 0.5 })));
    expect(s.bestStreak).toBe(5);
    expect(s.achievements.find((a) => a.id === "hot_streak")?.achieved).toBe(true);
  });

  it("does not count a break-even cash game as a win", () => {
    expect(isWin({ type: "cash", place: 1, entrants: 4, netBuyins: 0 })).toBe(false);
    expect(isWin({ type: "cash", place: 1, entrants: 4, netBuyins: 0.5 })).toBe(true);
    // Everyone broke even: every player shares place 1.
    const s = computePlayerStats([g({ place: 1, netBuyins: 0 }), g({ place: 1, netBuyins: 0, entrants: 3 })]);
    expect(s.wins).toBe(0);
    expect(s.cash.wins).toBe(0);
    expect(s.achievements.find((a) => a.id === "first_win")?.achieved).toBe(false);
    expect(s.best).toBeNull();
  });

  it("ignores single-entrant games for wins, achievements and the best game", () => {
    const solo = Array.from({ length: 3 }, () => g({ type: "tournament", place: 1, entrants: 1, points: 3, netBuyins: 1, buyinCount: 2 }));
    expect(isWin(solo[0])).toBe(false);
    expect(isGoodResult(solo[0])).toBe(false);
    const s = computePlayerStats(solo);
    expect(s.games).toBe(3);
    expect(s.tournament.games).toBe(3);
    expect(s.netBuyins).toBe(3);
    expect(s.wins).toBe(0);
    expect(s.tournament.wins).toBe(0);
    expect(s.avgPlace).toBeNull();
    expect(s.itmRate).toBeNull();
    expect(s.bestStreak).toBe(0);
    expect(s.best).toBeNull();
    const got = Object.fromEntries(s.achievements.map((a) => [a.id, a.achieved]));
    expect(got).toMatchObject({ first_win: false, comeback: false, hat_trick: false });
    expect(s.achievements.find((a) => a.id === "regular")?.progress).toEqual({ current: 3, target: 10 });
  });

  it("does not let a solo game break or extend a streak", () => {
    const s = computePlayerStats([g({ netBuyins: 1 }), g({ type: "tournament", place: 1, entrants: 1 }), g({ netBuyins: 1 })]);
    expect(s.bestStreak).toBe(2);
    expect(s.currentStreak).toBe(2);
  });

  it("has no best game when every game was a loss", () => {
    const s = computePlayerStats([
      g({ netBuyins: -0.5, place: 3 }),
      g({ netBuyins: -2, place: 6 }),
      g({ type: "tournament", place: 5, entrants: 6, points: 2, netBuyins: -1 }),
    ]);
    expect(s.best).toBeNull();
    expect(s.wins).toBe(0);
  });

  it("picks the best good result", () => {
    const small = g({ netBuyins: 0.5, place: 2 });
    const big = g({ netBuyins: 3, place: 1 });
    const s = computePlayerStats([small, g({ netBuyins: -1, place: 5 }), big]);
    expect(s.best?.gameId).toBe(big.gameId);
  });
});
