"use client";

import { useEffect, useRef, useState } from "react";
import { computeTimer, type TimerView } from "@/lib/game/blinds";
import type { GameDTO } from "@/lib/types";
import { haptic } from "./telegram";

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

  // A short heads-up one minute before the blinds go up.
  const warned = useRef<number | null>(null);
  useEffect(() => {
    if (view.status !== "running" || !view.nextLevel || view.level.isBreak) return;
    if (view.remainingMs <= 60_000 && view.remainingMs > 58_000 && warned.current !== view.levelIndex) {
      warned.current = view.levelIndex;
      tone([660], 0.18);
      haptic("light");
    }
  }, [view]);

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

/** Plays a sequence of short beeps (one per frequency, `gap` seconds apart). */
export function tone(freqs: number[], gap = 0.25, length = 0.2, volume = 0.25) {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    freqs.forEach((freq, i) => {
      const offset = i * gap;
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(volume, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + length);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + offset);
      osc.stop(now + offset + length + 0.02);
    });
  } catch {
    /* audio not available */
  }
}

/** Blind level change. */
export function beep() {
  tone([880, 880, 1320]);
}

/** Browsers only allow audio after a user gesture; call from a click handler to unlock it. */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}
