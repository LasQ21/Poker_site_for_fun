import { describe, expect, it } from "vitest";
import { computeProfile, type ProfileGameInput } from "./profile";
import type { ResultRow } from "./results";

const row = (r: Partial<ResultRow>): ResultRow => ({
  playerId: 1,
  key: "u:1",
  displayName: "Анна",
  userId: 1,
  buyinChips: 10_000,
  buyinCount: 1,
  finalChips: 10_000,
  netChips: 0,
  netBuyins: 0,
  place: 1,
  points: null,
  ...r,
});

const game = (id: string, day: number, type: "cash" | "tournament", r: Partial<ResultRow>, entrants = 4): ProfileGameInput => ({
  id,
  name: `Гра ${id}`,
  type,
  finishedAt: new Date(2026, 0, day),
  chatTitle: null,
  entrants,
  row: row(r),
});

describe("computeProfile", () => {
  it("is empty without games", () => {
    const p = computeProfile([]);
    expect(p.games).toBe(0);
    expect(p.winRate).toBe(0);
    expect(p.tournament.bestPlace).toBeNull();
    expect(p.cash.best).toBeNull();
  });

  it("aggregates cash and tournament games separately, in time order", () => {
    const p = computeProfile([
      game("c2", 3, "cash", { place: 3, netChips: -5_000, netBuyins: -0.5, buyinCount: 2 }),
      game("t1", 2, "tournament", { place: 1, points: 6 }),
      game("c1", 1, "cash", { place: 1, netChips: 15_000, netBuyins: 1.5 }),
      game("t2", 4, "tournament", { place: 3, points: 2 }),
    ]);
    expect(p.games).toBe(4);
    expect(p.wins).toBe(2);
    expect(p.podiums).toBe(4);
    expect(p.winRate).toBe(0.5);
    expect(p.bestWinStreak).toBe(2);

    expect(p.cash).toMatchObject({ games: 2, wins: 1, netChips: 10_000, netBuyins: 1, avgBuyins: 0.5, profitable: 1, rebuys: 1 });
    expect(p.cash.best).toEqual({ gameId: "c1", name: "Гра c1", value: 1.5 });
    expect(p.cash.worst).toEqual({ gameId: "c2", name: "Гра c2", value: -0.5 });
    expect(p.cashTimeline.map((g) => g.cum)).toEqual([1.5, 1]);

    expect(p.tournament).toMatchObject({ games: 2, wins: 1, podiums: 2, points: 8, avgPoints: 4, avgPlace: 2, bestPlace: 1 });
    expect(p.tournament.placeDist).toEqual([
      { place: 1, count: 1 },
      { place: 2, count: 0 },
      { place: 3, count: 1 },
    ]);
    expect(p.tournamentTimeline.map((g) => g.cum)).toEqual([6, 8]);

    expect(p.recent.map((g) => g.gameId)).toEqual(["t2", "c2", "t1", "c1"]);
  });
});
