import { describe, expect, it } from "vitest";
import { applyOptimistic } from "./optimistic";
import type { GameStateDTO, PlayerDTO } from "@/lib/types";

const player = (id: number, chips: number, extra: Partial<PlayerDTO> = {}): PlayerDTO => ({
  id,
  displayName: `P${id}`,
  userId: id,
  status: "active",
  finishPlace: null,
  finalChips: null,
  currentChips: chips,
  buyinChips: 1000,
  buyinCount: 1,
  lastUpdateAt: null,
  ...extra,
});

function state(type: "cash" | "tournament", players: PlayerDTO[]): GameStateDTO {
  return {
    game: {
      id: "g",
      name: "G",
      chatId: null,
      seasonId: null,
      hostUserId: 1,
      type,
      status: "active",
      startingStack: 1000,
      blindStructure: [{ sb: 5, bb: 10, ante: 0, minutes: 10 }],
      blindLevel: 0,
      levelStartedAt: null,
      pausedRemainingMs: null,
      reminderIntervalMin: null,
      joinCode: "1234",
      version: 3,
      createdAt: new Date(0).toISOString(),
      finishedAt: null,
    },
    host: { id: 1, name: "P1" },
    chat: null,
    players,
    buyins: [],
    snapshots: [],
    results: [],
    check: { totalStacks: 0, totalBuyins: 0, diff: 0 },
    viewer: { id: 1, firstName: "P1" },
    role: "host",
    myPlayerId: 1,
    serverNow: 0,
    idle: false,
  };
}

describe("applyOptimistic", () => {
  it("sets a stack and recomputes results and the chip check", () => {
    const s = applyOptimistic(state("cash", [player(1, 1000), player(2, 1000)]), { action: "setStack", playerId: 1, chips: 1500 }, 5)!;
    expect(s.players[0]).toMatchObject({ currentChips: 1500, lastUpdateAt: new Date(5).toISOString() });
    expect(s.results[0]).toMatchObject({ playerId: 1, netChips: 500 });
    expect(s.check).toEqual({ totalStacks: 2500, totalBuyins: 2000, diff: 500 });
    expect(s.snapshots).toEqual([{ playerId: 1, chips: 1500, t: 5 }]);
  });

  it("adds a rebuy with the starting stack by default and brings a busted player back", () => {
    const s = applyOptimistic(
      state("tournament", [player(1, 0, { status: "busted", finishPlace: 2 }), player(2, 2000)]),
      { action: "buyin", playerId: 1, kind: "rebuy" },
    )!;
    expect(s.players[0]).toMatchObject({ status: "active", finishPlace: null, currentChips: 1000, buyinChips: 2000, buyinCount: 2 });
    expect(s.buyins).toHaveLength(1);
  });

  it("busts a tournament player into the next free place", () => {
    const s = applyOptimistic(state("tournament", [player(1, 1000), player(2, 1000), player(3, 1000)]), { action: "bust", playerId: 2 })!;
    expect(s.players[1]).toMatchObject({ status: "busted", currentChips: 0, finishPlace: 3 });
    expect(s.results.at(-1)?.playerId).toBe(2);
  });

  it("skips actions it cannot predict and finished games", () => {
    const st = state("cash", [player(1, 1000)]);
    expect(applyOptimistic(st, { action: "timer", timer: "start" })).toBeNull();
    expect(applyOptimistic(st, { action: "setStack", playerId: 99, chips: 1 })).toBeNull();
    expect(applyOptimistic({ ...st, game: { ...st.game, status: "finished" } }, { action: "setStack", playerId: 1, chips: 1 })).toBeNull();
  });
});
