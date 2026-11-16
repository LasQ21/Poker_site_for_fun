"use client";

import { fmtBuyins, fmtChips, fmtSigned } from "@/lib/format";
import type { GameStateDTO, PlayerDTO } from "@/lib/types";
import { Badge, Signed } from "./ui";

export const PLAYER_COLORS = ["#2f80ed", "#eb5757", "#27ae60", "#f2994a", "#9b51e0", "#00a3bf", "#e84393", "#8d6e63", "#d4a017", "#6c7a89"];

export function playerColor(state: GameStateDTO, playerId: number) {
  const idx = state.players.findIndex((p) => p.id === playerId);
  return PLAYER_COLORS[(idx < 0 ? 0 : idx) % PLAYER_COLORS.length];
}

export function canEdit(state: GameStateDTO, p: PlayerDTO) {
  if (state.game.status !== "active") return false;
  return state.role === "host" || (state.viewer != null && p.userId === state.viewer.id);
}

function ago(iso: string | null, now: number) {
  if (!iso) return "";
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  return `${Math.floor(min / 60)} год тому`;
}

export function StackTable({ state, onSelect, now, bb }: { state: GameStateDTO; onSelect: (p: PlayerDTO) => void; now: number; bb: number }) {
  const { game } = state;
  const resultById = new Map(state.results.map((r) => [r.playerId, r]));
  const leader = Math.max(1, ...state.players.map((p) => p.currentChips));
  const order =
    game.type === "tournament"
      ? [...state.players].sort((a, b) => (resultById.get(a.id)?.place ?? 99) - (resultById.get(b.id)?.place ?? 99))
      : [...state.players].sort((a, b) => b.currentChips - a.currentChips);

  return (
    <div>
      {order.map((p) => {
        const r = resultById.get(p.id);
        const editable = canEdit(state, p);
        const mine = state.viewer && p.userId === state.viewer.id;
        const out = p.status !== "active";
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className={`relative flex w-full items-center gap-3 border-b border-sep px-4 py-3 text-left last:border-b-0 transition-colors active:bg-fg/5 ${out ? "opacity-55" : ""}`}
          >
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-bold text-white"
              style={{ background: playerColor(state, p.id) }}
            >
              {game.type === "tournament" && out ? r?.place ?? "—" : p.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={`truncate font-semibold ${out && game.type === "tournament" ? "line-through" : ""}`}>{p.displayName}</span>
                {mine && <Badge tone="accent">ви</Badge>}
                {p.userId == null && <span title="Без Telegram" className="text-[11px] text-hint">○</span>}
                {p.userId === state.game.hostUserId && <span title="Хост" className="text-[12px]">👑</span>}
              </span>
              <span className="mt-0.5 block text-[12px] text-hint">
                {game.type === "tournament" && out
                  ? `вибув · ${r?.place}-е місце`
                  : `${p.buyinCount} БІ · ${ago(p.lastUpdateAt, now)}`}
              </span>
              {!out && (
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-fg/8">
                  <span className="block h-full rounded-full" style={{ width: `${(p.currentChips / leader) * 100}%`, background: playerColor(state, p.id) }} />
                </span>
              )}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-lg font-bold tabular">{fmtChips(p.currentChips)}</span>
              {game.type === "cash" && r ? (
                <Signed value={r.netChips} className="block text-[12px] font-semibold">
                  {fmtSigned(r.netChips)} · {fmtBuyins(r.netBuyins)}
                </Signed>
              ) : (
                <span className="block text-[12px] text-hint tabular">
                  {bb > 0 ? `${Math.round(p.currentChips / bb)} BB` : ""}
                </span>
              )}
            </span>
            {editable && <span className="text-hint">›</span>}
          </button>
        );
      })}
    </div>
  );
}
