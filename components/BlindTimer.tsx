"use client";

import { formatBlinds, formatClock, levelDurationMs, type TimerAction } from "@/lib/game/blinds";
import { useTimer, unlockAudio } from "@/lib/client/timer";
import { fmtChips } from "@/lib/format";
import type { GameDTO } from "@/lib/types";

function levelNo(game: GameDTO, idx: number) {
  return game.blindStructure.slice(0, idx + 1).filter((l) => !l.isBreak).length;
}

export function BlindTimer({
  game,
  clockOffset,
  isHost,
  onAction,
}: {
  game: GameDTO;
  clockOffset: number;
  isHost: boolean;
  onAction: (a: TimerAction) => void;
}) {
  const v = useTimer(game, clockOffset);
  const active = game.status === "active";
  const fixed = game.blindStructure.length === 1 && !Number.isFinite(levelDurationMs(game.blindStructure[0]));

  if (fixed) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-section px-4 py-3">
        <div>
          <div className="text-[13px] text-hint">Блайнди</div>
          <div className="text-xl font-bold tabular">{formatBlinds(v.level)}</div>
        </div>
        <div className="text-right text-[13px] text-hint">
          Стек {fmtChips(game.startingStack)}
          <br />= {Math.round(game.startingStack / Math.max(1, v.level.bb))} BB
        </div>
      </div>
    );
  }

  const dur = levelDurationMs(v.level);
  const progress = Number.isFinite(dur) ? 1 - v.remainingMs / dur : 0;
  const warn = v.status === "running" && v.remainingMs < 60_000 && v.nextLevel;

  return (
    <div className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-felt to-felt-2 text-white shadow-sm">
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between text-[13px] font-medium text-white/75">
          <span>{v.level.isBreak ? "Перерва" : `Рівень ${levelNo(game, v.levelIndex)}`}</span>
          <span>
            {v.status === "running" ? "● йде" : v.status === "paused" ? "❚❚ пауза" : "не запущено"}
          </span>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-3xl font-extrabold tabular sm:text-4xl">
              {v.level.isBreak ? "☕ Перерва" : `${fmtChips(v.level.sb)}/${fmtChips(v.level.bb)}`}
            </div>
            {!v.level.isBreak && v.level.ante > 0 && <div className="text-sm text-white/75">анте {fmtChips(v.level.ante)}</div>}
          </div>
          <div className={`text-4xl font-bold tabular sm:text-5xl ${warn ? "animate-pulse text-amber-300" : ""}`} aria-live="off">
            {formatClock(v.remainingMs)}
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
        </div>
        <div className="mt-2 pb-4 text-[13px] text-white/75">
          {v.nextLevel ? <>Далі: {formatBlinds(v.nextLevel)}</> : "Останній рівень"}
        </div>
      </div>
      {isHost && active && (
        <div className="flex border-t border-white/15">
          <TimerBtn label="Попередній рівень" onClick={() => onAction("prev")} disabled={v.levelIndex === 0}>⏮</TimerBtn>
          {v.status === "running" ? (
            <TimerBtn label="Пауза" onClick={() => onAction("pause")} wide>❚❚ Пауза</TimerBtn>
          ) : (
            <TimerBtn
              label="Старт"
              onClick={() => {
                unlockAudio();
                onAction(v.status === "paused" ? "resume" : "start");
              }}
              wide
            >
              ▶ {v.status === "paused" ? "Продовжити" : "Старт"}
            </TimerBtn>
          )}
          <TimerBtn label="Наступний рівень" onClick={() => onAction("next")} disabled={!v.nextLevel}>⏭</TimerBtn>
        </div>
      )}
    </div>
  );
}

function TimerBtn({ children, onClick, disabled, wide, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; wide?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`${wide ? "flex-[2]" : "flex-1"} py-3 text-[15px] font-semibold transition active:bg-white/10 disabled:opacity-35 border-r border-white/15 last:border-r-0`}
    >
      {children}
    </button>
  );
}
