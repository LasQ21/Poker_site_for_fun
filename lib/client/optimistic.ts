import { chipCheck, computeResults } from "@/lib/game/results";
import type { GameActionInput } from "@/lib/server/schemas";
import type { GameStateDTO, PlayerDTO } from "@/lib/types";

/**
 * Predicts the state after an action so the UI reacts instantly; the server answer replaces it
 * (or SWR rolls it back on error). Returns null for actions that are not predicted.
 */
export function applyOptimistic(state: GameStateDTO, a: GameActionInput, now = Date.now()): GameStateDTO | null {
  if (state.game.status !== "active") return null;
  const at = new Date(now).toISOString();
  let players: PlayerDTO[];
  let buyins = state.buyins;
  const snapshots = [...state.snapshots];
  const patch = (id: number, fn: (p: PlayerDTO) => Partial<PlayerDTO>) => {
    const p = state.players.find((x) => x.id === id);
    if (!p) return null;
    return state.players.map((x) => (x.id === id ? { ...x, ...fn(x) } : x));
  };

  switch (a.action) {
    case "setStack": {
      const res = patch(a.playerId, (p) => ({
        currentChips: a.chips,
        lastUpdateAt: at,
        ...(p.status === "busted" && a.chips > 0 && state.game.type === "cash" ? { status: "active" as const } : {}),
      }));
      if (!res) return null;
      players = res;
      snapshots.push({ playerId: a.playerId, chips: a.chips, t: now });
      break;
    }
    case "buyin": {
      const amount = a.chips ?? state.game.startingStack;
      const res = patch(a.playerId, (p) => ({
        currentChips: p.currentChips + amount,
        buyinChips: p.buyinChips + amount,
        buyinCount: p.buyinCount + 1,
        lastUpdateAt: at,
        status: "active",
        finishPlace: null,
      }));
      if (!res) return null;
      players = res;
      const p = players.find((x) => x.id === a.playerId)!;
      snapshots.push({ playerId: a.playerId, chips: p.currentChips, t: now });
      buyins = [...buyins, { id: -now, playerId: a.playerId, chips: amount, kind: a.kind ?? "rebuy", createdAt: at }];
      break;
    }
    case "bust": {
      const activeCount = state.players.filter((p) => p.status === "active").length;
      const res = patch(a.playerId, (p) =>
        p.status !== "active"
          ? {}
          : {
              status: "busted",
              currentChips: 0,
              lastUpdateAt: at,
              finishPlace: state.game.type === "tournament" ? Math.max(1, activeCount) : null,
            },
      );
      if (!res) return null;
      players = res;
      snapshots.push({ playerId: a.playerId, chips: 0, t: now });
      break;
    }
    default:
      return null;
  }

  return {
    ...state,
    players,
    buyins,
    snapshots,
    results: computeResults(state.game, players),
    check: chipCheck(players.filter((p) => p.status !== "left" || p.currentChips > 0)),
  };
}
