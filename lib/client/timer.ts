"use client";

import { useEffect, useRef, useState } from "react";
import { computeTimer, type TimerView } from "@/lib/game/blinds";
import type { GameDTO } from "@/lib/types";
import { haptic } from "./telegram";
import { getSettings } from "./settings";

/** Live timer view, recomputed several times a second using the server clock offset. */
export function useTimer(game: GameDTO, clockOffsetMs: number): TimerView {
  const calc = () =>
    computeTimer(
      game.blindStructure,
      {
        blindLevel: game.blindLevel,
        levelStartedAt: game.levelStartedAt ? new Date(game.levelStartedAt) : null,
        pausedRemainingMs: game.pausedRemainingMs,
      },
      new Date(Date.now() + clockOffsetMs),
    );
  const [view, setView] = useState<TimerView>(calc);
  const calcRef = useRef(calc);
  calcRef.current = calc;

  useEffect(() => {
    setView(calcRef.current());
    const id = setInterval(() => setView(calcRef.current()), 250);
    return () => clearInterval(id);
  }, [game.blindLevel, game.levelStartedAt, game.pausedRemainingMs, game.blindStructure, clockOffsetMs]);

  // Sound + haptics when the level changes while the timer runs.
  const prevLevel = useRef(view.levelIndex);
  useEffect(() => {
    if (view.levelIndex !== prevLevel.current && view.status === "running" && view.levelIndex > prevLevel.current) {
      beep();
      haptic("warning");
    }
    prevLevel.current = view.levelIndex;
  }, [view.levelIndex, view.status]);

  return view;
}

let ctx: AudioContext | null = null;

export function beep() {
  if (!getSettings().sound) return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    [0, 0.25, 0.5].forEach((offset, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    });
  } catch {
    /* audio not available */
  }
}

/** Browsers only allow audio after a user gesture; call from a click handler to unlock it. */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}
