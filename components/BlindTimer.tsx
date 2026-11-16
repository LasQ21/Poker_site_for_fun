"use client";

import { formatBlinds, formatClock, levelDurationMs, type TimerAction } from "@/lib/game/blinds";
import { useTimer, unlockAudio } from "@/lib/client/timer";
import { fmtChips } from "@/lib/format";
import type { GameDTO } from "@/lib/types";
import { IconNext, IconPause, IconPlay, IconPrev } from "./icons";

function levelNo(game: GameDTO, idx: number) {
  return game.blindStructure.slice(0, idx + 1).filter((l) => !l.isBreak).length;
}

const R = 92;
const C = 2 * Math.PI * R;

/** The blind clock drawn as a poker chip seen through glass: the edge inserts frame a progress ring. */
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
      <div className="glass mb-5 flex items-center gap-4 rounded-[28px] px-4 py-3.5">
        <span className="chip h-12 w-12" style={{ ["--chip" as string]: "var(--felt)" }} />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-hint">Блайнди</div>
          <div className="font-display text-xl font-bold tabular">{formatBlinds(v.level)}</div>
        </div>
        <div className="text-right text-[13px] font-semibold text-hint">
          стек {fmtChips(game.startingStack)}
          <br />
          {Math.round(game.startingStack / Math.max(1, v.level.bb))} BB
        </div>
      </div>
    );
  }

  const dur = levelDurationMs(v.level);
  const progress = Number.isFinite(dur) ? Math.min(1, Math.max(0, 1 - v.remainingMs / dur)) : 0;
  const lastMinute = v.status === "running" && v.remainingMs < 60_000 && !!v.nextLevel;
  const ringColor = v.level.isBreak ? "var(--gold)" : lastMinute ? "var(--negative)" : "var(--app-link)";
  const statusText = v.status === "running" ? "Йде" : v.status === "paused" ? "Пауза" : "Не запущено";

  return (
    <div className="glass-lens glass mb-5 overflow-hidden rounded-[34px] px-4 pb-4 pt-3.5">
      <div className="flex items-center justify-between px-1 text-[13px] font-bold">
        <span className="text-fg/80">{v.level.isBreak ? "Перерва" : `Рівень ${levelNo(game, v.levelIndex)}`}</span>
        <span className={`flex items-center gap-1.5 ${v.status === "running" ? "text-pos" : "text-hint"}`}>
          <span className={`h-2 w-2 rounded-full ${v.status === "running" ? "animate-pulse bg-pos" : "bg-hint/60"}`} />
          {statusText}
        </span>
      </div>

      <div className="relative mx-auto my-1 aspect-square w-[min(62vw,232px)]">
        <svg viewBox="0 0 220 220" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          {/* chip edge inserts */}
          <circle cx="110" cy="110" r="104" fill="none" stroke="currentColor" className="text-fg/10" strokeWidth="9" strokeDasharray="22 18.84" />
          {/* track + progress */}
          <circle cx="110" cy="110" r={R} fill="none" stroke="currentColor" className="text-fg/8" strokeWidth="7" />
          <circle
            cx="110"
            cy="110"
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${C * progress} ${C}`}
            style={{ transition: "stroke-dasharray .3s linear, stroke .3s" }}
          />
        </svg>
        <div key={v.levelIndex} className="animate-level absolute inset-[16%] flex flex-col items-center justify-center rounded-full text-center">
          <div
            className={`font-display text-[clamp(2rem,11vw,2.9rem)] font-bold leading-none tabular ${lastMinute ? "text-neg" : ""}`}
            aria-live="off"
          >
            {formatClock(v.remainingMs)}
          </div>
          <div className="mt-2 font-display text-[clamp(.95rem,4.4vw,1.15rem)] font-semibold tabular text-fg/85">
            {v.level.isBreak ? "☕ перерва" : `${fmtChips(v.level.sb)} / ${fmtChips(v.level.bb)}`}
          </div>
          {!v.level.isBreak && v.level.ante > 0 && <div className="mt-0.5 text-xs font-semibold text-hint">анте {fmtChips(v.level.ante)}</div>}
        </div>
      </div>

      <div className="mb-3 text-center text-[13px] font-semibold text-hint">
        {v.nextLevel ? <>Далі {formatBlinds(v.nextLevel)}</> : "Останній рівень"}
      </div>

      {isHost && active && (
        <div className="flex items-center justify-center gap-4">
          <RoundBtn label="Попередній рівень" onClick={() => onAction("prev")} disabled={v.levelIndex === 0}>
            <IconPrev width={20} height={20} />
          </RoundBtn>
          {v.status === "running" ? (
            <RoundBtn label="Пауза" big onClick={() => onAction("pause")}>
              <IconPause width={26} height={26} />
            </RoundBtn>
          ) : (
            <RoundBtn
              label={v.status === "paused" ? "Продовжити" : "Старт"}
              big
              primary
              onClick={() => {
                unlockAudio();
                onAction(v.status === "paused" ? "resume" : "start");
              }}
            >
              <IconPlay width={26} height={26} />
            </RoundBtn>
          )}
          <RoundBtn label="Наступний рівень" onClick={() => onAction("next")} disabled={!v.nextLevel}>
            <IconNext width={20} height={20} />
          </RoundBtn>
        </div>
      )}
    </div>
  );
}

function RoundBtn({
  children,
  onClick,
  disabled,
  big,
  primary,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  big?: boolean;
  primary?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`${primary ? "glass-tint" : "glass-strong"} grid place-items-center rounded-full transition active:scale-90 disabled:opacity-35 ${
        big ? "h-16 w-16" : "h-12 w-12"
      }`}
    >
      {children}
    </button>
  );
}
