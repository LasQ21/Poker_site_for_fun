"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/client/telegram";
import { tone, unlockAudio } from "@/lib/client/timer";
import { IconPause, IconPlay, IconStop } from "./icons";

const R = 46;
const C = 2 * Math.PI * R;
const EXTRA_MS = 15_000;

type Clock = { endsAt: number | null; pausedLeft: number | null; fullMs: number };

/**
 * Shot clock for one move. It runs on this device only (no server round-trip, so it is instant):
 * tap the dial when the action passes to the next player. Space bar works too.
 */
export function TurnTimer({ seconds }: { seconds: number }) {
  const full = seconds * 1000;
  const [clock, setClock] = useState<Clock>({ endsAt: null, pausedLeft: null, fullMs: full });
  const [now, setNow] = useState(() => Date.now());
  const lastSecond = useRef<number | null>(null);

  const running = clock.endsAt != null;
  const paused = clock.pausedLeft != null;
  const left = running ? Math.max(0, clock.endsAt! - now) : paused ? clock.pausedLeft! : full;
  const expired = running && left === 0;
  const sec = Math.ceil(left / 1000);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);

  // Ticks for the last 5 seconds, an alarm at zero.
  useEffect(() => {
    if (!running) {
      lastSecond.current = null;
      return;
    }
    if (lastSecond.current === sec) return;
    lastSecond.current = sec;
    if (sec === 0) {
      tone([988, 988, 988, 1480], 0.16, 0.13, 0.3);
      haptic("heavy");
    } else if (sec <= 5) {
      tone([sec <= 3 ? 1046 : 784], 0, 0.07, 0.18);
      haptic("light");
    }
  }, [sec, running]);

  const nextTurn = useCallback(() => {
    unlockAudio();
    haptic("medium");
    const t = Date.now();
    setNow(t);
    setClock({ endsAt: t + full, pausedLeft: null, fullMs: full });
  }, [full]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      nextTurn();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [nextTurn]);

  const pause = () => {
    haptic("light");
    setClock((c) => ({ ...c, endsAt: null, pausedLeft: Math.max(0, (c.endsAt ?? Date.now()) - Date.now()) }));
  };
  const resume = () => {
    unlockAudio();
    haptic("light");
    const t = Date.now();
    setNow(t);
    setClock((c) => ({ ...c, endsAt: t + (c.pausedLeft ?? full), pausedLeft: null }));
  };
  const stop = () => {
    haptic("light");
    setClock({ endsAt: null, pausedLeft: null, fullMs: full });
  };
  const addTime = () => {
    haptic("light");
    const t = Date.now();
    setNow(t);
    setClock((c) => {
      const base = c.endsAt != null ? Math.max(c.endsAt, t) : t + (c.pausedLeft ?? 0);
      const endsAt = base + EXTRA_MS;
      return c.pausedLeft != null
        ? { ...c, pausedLeft: c.pausedLeft + EXTRA_MS, fullMs: Math.max(c.fullMs, c.pausedLeft + EXTRA_MS) }
        : { ...c, endsAt, pausedLeft: null, fullMs: Math.max(c.fullMs, endsAt - t) };
    });
  };

  const fraction = running || paused ? Math.min(1, left / Math.max(1, clock.fullMs)) : 1;
  const urgent = (running || paused) && sec <= 5;
  const ring = expired || urgent ? "var(--negative)" : sec <= 10 && (running || paused) ? "var(--gold)" : "var(--app-link)";
  const state = expired ? "Час вийшов!" : running ? "Гравець думає" : paused ? "Пауза" : "Готово";

  return (
    <div className={`glass mb-5 flex items-center gap-4 rounded-[30px] px-4 py-3.5 ${expired ? "animate-pulse" : ""}`}>
      <button
        type="button"
        onClick={nextTurn}
        aria-label={running || paused || expired ? "Наступний хід — перезапустити таймер" : "Почати таймер ходу"}
        className="relative grid h-[104px] w-[104px] shrink-0 place-items-center rounded-full transition active:scale-95"
      >
        <svg viewBox="0 0 104 104" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="52" cy="52" r={R} fill="none" stroke="currentColor" className="text-fg/8" strokeWidth="7" />
          <circle
            cx="52"
            cy="52"
            r={R}
            fill="none"
            stroke={ring}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${C * fraction} ${C}`}
            style={{ transition: "stroke-dasharray .12s linear, stroke .3s" }}
          />
        </svg>
        <span className="relative text-center">
          <span className={`block font-display text-[2rem] font-bold leading-none tabular ${urgent || expired ? "text-neg" : ""}`}>
            {expired ? "0" : sec}
          </span>
          <span className="mt-0.5 block text-[11px] font-bold text-hint">сек</span>
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold text-fg/80">Таймер ходу · {seconds} с</span>
        </div>
        <div className={`font-display text-[17px] font-bold ${expired ? "text-neg" : ""}`}>{state}</div>
        <div className="mb-2 text-[12px] font-medium leading-snug text-hint">
          {running || paused || expired ? "Торкніться кола — хід наступного гравця" : "Торкніться кола, коли гравець почав думати"}
        </div>
        <div className="flex gap-2">
          {running && !expired ? (
            <SmallBtn label="Пауза" onClick={pause}>
              <IconPause width={16} height={16} />
            </SmallBtn>
          ) : paused ? (
            <SmallBtn label="Продовжити" onClick={resume}>
              <IconPlay width={16} height={16} />
            </SmallBtn>
          ) : null}
          {(running || paused) && (
            <SmallBtn label="Додати 15 секунд" onClick={addTime}>
              <span className="text-[12px] font-bold">+15</span>
            </SmallBtn>
          )}
          {(running || paused) && (
            <SmallBtn label="Зупинити" onClick={stop}>
              <IconStop width={15} height={15} />
            </SmallBtn>
          )}
        </div>
      </div>
    </div>
  );
}

function SmallBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="glass-strong grid h-9 min-w-9 place-items-center rounded-full px-2.5 transition active:scale-90"
    >
      {children}
    </button>
  );
}
