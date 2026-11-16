import { describe, expect, it } from "vitest";
import { bustPlace, chipCheck, computeLeaderboard, computeResults, tournamentPoints, type ResultPlayerInput } from "./results";

const p = (id: number, name: string, over: Partial<ResultPlayerInput> = {}): ResultPlayerInput => ({
  id,
  displayName: name,
  userId: null,
  status: "active",
  finishPlace: null,
  finalChips: null,
  currentChips: 10_000,
  buyinChips: 10_000,
  buyinCount: 1,
  ...over,
});

describe("cash results", () => {
  it("computes net chips and buy-ins", () => {
    const rows = computeResults({ type: "cash", startingStack: 10_000 }, [
      p(1, "A", { currentChips: 25_000, buyinChips: 10_000 }),
      p(2, "B", { currentChips: 0, buyinChips: 20_000, buyinCount: 2 }),
      p(3, "C", { currentChips: 15_000, finalChips: 15_000 }),
    ]);
    expect(rows.map((r) => [r.displayName, r.netChips, r.netBuyins, r.place])).toEqual([
      ["A", 15_000, 1.5, 1],
      ["C", 5_000, 0.5, 2],
      ["B", -20_000, -2, 3],
    ]);
    expect(rows.every((r) => r.points === null)).toBe(true);
  });

  it("prefers confirmed final chips", () => {
    const [r] = computeResults({ type: "cash", startingStack: 1000 }, [p(1, "A", { currentChips: 1, finalChips: 1500, buyinChips: 1000 })]);
    expect(r.netChips).toBe(500);
  });
});

describe("tournament results", () => {
  it("ranks remaining players by chips above busted ones and awards points", () => {
    const rows = computeResults({ type: "tournament", startingStack: 10_000 }, [
      p(1, "A", { status: "busted", finishPlace: 4, currentChips: 0 }),
      p(2, "B", { currentChips: 30_000 }),
      p(3, "C", { status: "busted", finishPlace: 3, currentChips: 0 }),
      p(4, "D", { currentChips: 10_000 }),
    ]);
    expect(rows.map((r) => [r.displayName, r.place, r.points])).toEqual([
      ["B", 1, 6],
      ["D", 2, 3],
      ["C", 3, 2],
      ["A", 4, 1],
    ]);
  });

  it("points formula", () => {
    expect(tournamentPoints(1, 5)).toBe(7);
    expect(tournamentPoints(5, 5)).toBe(1);
    expect(tournamentPoints(0, 5)).toBe(0);
    expect(bustPlace(4)).toBe(4);
  });
});

describe("chipCheck", () => {
  it("reports discrepancy", () => {
    expect(chipCheck([{ currentChips: 9000, buyinChips: 10_000 }, { currentChips: 10_500, buyinChips: 10_000 }])).toEqual({
      totalStacks: 19_500,
      totalBuyins: 20_000,
      diff: -500,
    });
  });
});

describe("leaderboard", () => {
  it("aggregates by user id or normalized name", () => {
    const g1 = computeResults({ type: "tournament", startingStack: 1000 }, [
      p(1, "Олег", { userId: 7, currentChips: 3000 }),
      p(2, "anna", { status: "busted", finishPlace: 3, currentChips: 0 }),
      p(3, "Ivan", { status: "busted", finishPlace: 2, currentChips: 0 }),
    ]);
    const g2 = computeResults({ type: "tournament", startingStack: 1000 }, [
      p(4, "Oleh", { userId: 7, status: "busted", finishPlace: 2, currentChips: 0 }),
      p(5, "Anna ", { currentChips: 2000 }),
    ]);
    const lb = computeLeaderboard(
      [
        { id: "g1", name: "G1", type: "tournament", finishedAt: new Date(1), results: g1 },
        { id: "g2", name: "G2", type: "tournament", finishedAt: new Date(2), results: g2 },
        { id: "c", name: "Cash", type: "cash", finishedAt: new Date(3), results: [] },
      ],
      "tournament",
    );
    expect(lb.map((r) => [r.displayName, r.games, r.wins, r.points])).toEqual([
      ["Oleh", 2, 1, 6],
      ["Anna ", 2, 1, 5],
      ["Ivan", 1, 0, 2],
    ]);
    expect(lb[0].bestGame).toMatchObject({ gameId: "g1", value: 5 });
    expect(lb[0].avgPlace).toBe(1.5);
  });

  it("ranks cash by buy-ins won", () => {
    const g = computeResults({ type: "cash", startingStack: 1000 }, [
      p(1, "A", { currentChips: 500, buyinChips: 1000 }),
      p(2, "B", { currentChips: 1500, buyinChips: 1000 }),
    ]);
    const lb = computeLeaderboard([{ id: "g", name: "G", type: "cash", finishedAt: null, results: g }], "cash");
    expect(lb.map((r) => [r.displayName, r.netBuyins])).toEqual([["B", 0.5], ["A", -0.5]]);
  });
});
