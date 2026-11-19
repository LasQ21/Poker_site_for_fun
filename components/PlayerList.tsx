"use client";

import { fmtChips, pluralUk } from "@/lib/format";
import type { GameStateDTO, PlayerDTO } from "@/lib/types";
import { IconChevron } from "./icons";
import { Badge, ChipAvatar } from "./ui";

/** Chip colours: classic casino denominations first. */
export const PLAYER_COLORS = ["#d9423b", "#2f6fdb", "#0f8a5f", "#475569", "#7b4bd6", "#e08a1e", "#d63d8c", "#11a3b8", "#8a6a3d", "#5a6b7b"];

export function playerColor(state: GameStateDTO, playerId: number) {
  const idx = state.players.findIndex((p) => p.id === playerId);
  return PLAYER_COLORS[(idx < 0 ? 0 : idx) % PLAYER_COLORS.length];
}

export function canEdit(state: GameStateDTO, p: PlayerDTO) {
  if (state.game.status !== "active") return false;
  return state.role === "host" || (state.viewer != null && p.userId === state.viewer.id);
}

/**
 * Who is at the table and how many chips each one bought. Stacks are not tracked during play —
 * the host enters final stacks once, when the game ends.
 */
export function PlayerList({ state, onSelect }: { state: GameStateDTO; onSelect: (p: PlayerDTO) => void }) {
  const { game } = state;
  const resultById = new Map(state.results.map((r) => [r.playerId, r]));
  const finished = game.status === "finished";
  const order = [...state.players].sort((a, b) => {
    if (finished || game.type === "tournament") {
      return (resultById.get(a.id)?.place ?? 99) - (resultById.get(b.id)?.place ?? 99);
    }
    return a.id - b.id;
  });

  return (
    <div>
      {order.map((p) => {
        const r = resultById.get(p.id);
        const mine = state.viewer && p.userId === state.viewer.id;
        const out = game.type === "tournament" && p.status === "busted";
        const rebuys = p.buyinCount - 1;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className={`flex w-full items-center gap-3 border-b hairline px-3.5 py-3 text-left last:border-b-0 transition-colors active:bg-fg/5 ${out ? "opacity-55" : ""}`}
          >
            <ChipAvatar
              color={playerColor(state, p.id)}
              muted={out}
              label={out ? (r?.place ?? "—") : p.displayName.slice(0, 1).toUpperCase()}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={`truncate font-bold ${out ? "line-through" : ""}`}>{p.displayName}</span>
                {mine && <Badge tone="accent">ви</Badge>}
                {p.userId == null && <span title="Без Telegram" className="text-[11px] text-hint">○</span>}
                {p.userId === game.hostUserId && <span title="Хост" className="text-[12px]">👑</span>}
              </span>
              <span className="mt-0.5 block text-[12px] font-medium text-hint">
                {out
                  ? `вибув · ${r?.place}-е місце`
                  : rebuys > 0
                    ? `${rebuys} ${pluralUk(rebuys, "ребай", "ребаї", "ребаїв")}`
                    : "без ребаїв"}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-display text-[16px] font-bold tabular">{fmtChips(p.buyinChips)}</span>
              <span className="block text-[11px] font-semibold text-hint">
                {p.buyinCount} {pluralUk(p.buyinCount, "бай-ін", "бай-іни", "бай-інів")}
              </span>
            </span>
            <IconChevron className="shrink-0 text-hint/70" />
          </button>
        );
      })}
    </div>
  );
}
