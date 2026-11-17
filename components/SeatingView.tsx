"use client";

import { useState } from "react";
import { tableLayout, type SeatPlayer } from "@/lib/game/seating";
import { confirmDialog } from "@/lib/client/telegram";
import { pluralUk } from "@/lib/format";
import type { GameActionInput } from "@/lib/server/schemas";
import type { GameStateDTO } from "@/lib/types";
import { playerColor } from "./StackTable";
import { Button, ChipAvatar, Choice, Section, Sheet } from "./ui";

type Act = (a: GameActionInput, ok?: string) => Promise<boolean>;

/** Position of seat `i` of `n` around an oval, clockwise from the bottom centre (percent of the box). */
function seatPos(i: number, n: number) {
  const a = Math.PI / 2 + (2 * Math.PI * i) / n;
  return { left: 50 + 44 * Math.cos(a), top: 50 + 40 * Math.sin(a) };
}

const seatedLabel = (n: number) => `${n} ${pluralUk(n, "гравець", "гравці", "гравців")}`;

export function SeatingView({ state, act, compact }: { state: GameStateDTO; act: Act; compact?: boolean }) {
  const tables = state.game.tables;
  if (!tables) return null;
  const host = state.role === "host" && state.game.status === "active";
  const seatPlayers: SeatPlayer[] = state.players.map((p) => ({
    id: p.id,
    active: p.status === "active",
    tableNo: p.tableNo,
    seatNo: p.seatNo,
  }));
  const layout = tableLayout(tables, seatPlayers);
  const byId = new Map(state.players.map((p) => [p.id, p]));

  return (
    <div className={compact ? "" : "space-y-3 p-3"}>
      {layout.map((t) => (
        <div key={t.no}>
          {!compact && (
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="font-display font-bold">Стіл {t.no}</span>
              {host && (
                <Button size="sm" variant="secondary" onClick={() => act({ action: "moveButton", tableNo: t.no })} aria-label={`Передати баттон за столом ${t.no}`}>
                  🔘 Баттон →
                </Button>
              )}
            </div>
          )}
          <div className="relative mx-auto aspect-[1.75] w-full max-w-md">
            <div
              className="absolute inset-[14%_12%] rounded-full shadow-inner"
              style={{ background: "radial-gradient(ellipse at 50% 40%, var(--felt) 0%, var(--felt-2) 100%)", boxShadow: "inset 0 0 0 6px rgba(120,72,30,.55), inset 0 6px 18px rgba(0,0,0,.35)" }}
            >
              <div className="grid h-full place-items-center text-center text-[11px] font-bold uppercase tracking-widest text-white/45">
                {compact ? `Стіл ${t.no}` : seatedLabel(t.seats.filter((s) => s.playerId != null).length)}
              </div>
            </div>
            {t.seats.map((s, i) => {
              const pos = seatPos(i, t.seats.length);
              const p = s.playerId != null ? byId.get(s.playerId) : undefined;
              const mine = p && p.id === state.myPlayerId;
              return (
                <div
                  key={s.seatNo}
                  className="absolute flex w-[22%] -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                >
                  <span className="relative">
                    {p ? (
                      <span className={mine ? "rounded-full ring-2 ring-link ring-offset-2 ring-offset-transparent" : ""}>
                        <ChipAvatar color={playerColor(state, p.id)} label={p.displayName.slice(0, 1).toUpperCase()} size={compact ? 30 : 36} />
                      </span>
                    ) : (
                      <span
                        className="grid place-items-center rounded-full border-2 border-dashed border-fg/20 text-[11px] font-bold text-hint"
                        style={{ width: compact ? 30 : 36, height: compact ? 30 : 36 }}
                        aria-label={`Місце ${s.seatNo} вільне`}
                      >
                        {s.seatNo}
                      </span>
                    )}
                    {t.button === s.seatNo && (
                      <span
                        className="absolute -right-2 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-black text-black shadow ring-1 ring-black/20"
                        title="Дилер"
                        aria-label="Дилерський баттон"
                      >
                        D
                      </span>
                    )}
                  </span>
                  {p && (
                    <span className="mt-0.5 max-w-full truncate rounded-full bg-[var(--app-section)]/70 px-1.5 text-[11px] font-bold leading-4">
                      {p.displayName}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {host && !compact && (
        <div className="flex gap-2 px-1 pt-1">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => act({ action: "rebalance" }, "Столи перевірено")}>
            ⚖️ Балансувати
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (await confirmDialog("Прибрати розсадку?")) await act({ action: "clearSeating" }, "Розсадку прибрано");
            }}
          >
            Скинути
          </Button>
        </div>
      )}
    </div>
  );
}

/** Host sheet: random draw with the chosen table size. */
export function SeatingSheet({ state, open, onClose, act }: { state: GameStateDTO; open: boolean; onClose: () => void; act: Act }) {
  const active = state.players.filter((p) => p.status === "active").length;
  const [per, setPer] = useState(state.game.tables?.seatsPerTable ?? Math.min(9, Math.max(2, active)));
  const tablesCount = Math.max(1, Math.ceil(active / per));
  return (
    <Sheet open={open} onClose={onClose} title="Розсадка">
      <p className="mb-3 text-sm text-hint">
        Випадкова розсадка {active} гравців. Коли хтось вибуває, столи автоматично балансуються, а зайвий стіл розформовується.
      </p>
      <div className="mb-1 text-[13px] font-semibold text-hint">Місць за столом</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[4, 6, 7, 8, 9, 10].map((n) => (
          <Choice key={n} active={per === n} onClick={() => setPer(n)}>
            {n}
          </Choice>
        ))}
      </div>
      <div className="mb-4 rounded-2xl bg-fg/5 px-3 py-2 text-sm">
        {tablesCount === 1 ? "Один стіл" : `${tablesCount} столи`} · по {Math.floor(active / tablesCount)}–{Math.ceil(active / tablesCount)} гравців
      </div>
      <Button
        size="lg"
        className="mb-2 w-full"
        disabled={active < 2}
        onClick={async () => {
          if (await act({ action: "seatRandom", seatsPerTable: per }, "Гравців розсаджено")) onClose();
        }}
      >
        🎲 {state.game.tables ? "Розсадити заново" : "Розсадити випадково"}
      </Button>
    </Sheet>
  );
}

export function SeatingSection({ state, act, onReseat }: { state: GameStateDTO; act: Act; onReseat: () => void }) {
  if (!state.game.tables) return null;
  return (
    <Section
      title="Розсадка"
      action={
        state.role === "host" && state.game.status === "active" ? (
          <button type="button" className="text-sm font-bold text-link" onClick={onReseat}>
            Заново
          </button>
        ) : undefined
      }
    >
      <SeatingView state={state} act={act} />
    </Section>
  );
}
