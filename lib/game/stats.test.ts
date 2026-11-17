import { describe, expect, it } from "vitest";
import { computePlayerStats, isGoodResult, itmPlaces, type PlayerGameResult } from "./stats";

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
});
