import { fmtChips, getFormatLang } from "@/lib/format";
import { translate, type Lang } from "@/lib/i18n";

/** One level of a blind structure. `minutes` is the level duration. */
export interface BlindLevel {
  sb: number;
  bb: number;
  ante: number;
  minutes: number;
  /** A break instead of a playing level (blinds of the break are ignored). */
  isBreak?: boolean;
}

/** Persisted timer state of a game. */
export interface TimerState {
  /** Anchor level index. */
  blindLevel: number;
  /** When the anchor level started (running timer). null = not started or paused. */
  levelStartedAt: Date | null;
  /** Remaining ms of the anchor level while paused. */
  pausedRemainingMs: number | null;
}

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerView {
  status: TimerStatus;
  levelIndex: number;
  level: BlindLevel;
  nextLevel: BlindLevel | null;
  remainingMs: number;
  /** Absolute time the current level ends (only while running and not on the last level). */
  levelEndsAt: Date | null;
}

export type BlindTemplateId = "turbo" | "regular" | "deep" | "cash";

/** Level length per template; labels are i18n keys `blinds.tpl.<id>` / `blinds.tplShort.<id>`. */
export const BLIND_TEMPLATES: Record<BlindTemplateId, { minutes: number }> = {
  turbo: { minutes: 10 },
  regular: { minutes: 20 },
  deep: { minutes: 30 },
  cash: { minutes: 0 },
};

/** Small-blind ladder in "units" (unit = starting stack / 400, rounded to a nice number); BB = 2 × SB. */
const SB_LADDER = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 30, 40, 50, 60, 80, 100, 120, 160, 200, 300];

const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

export function niceUnit(startingStack: number): number {
  const raw = Math.max(1, startingStack / 400);
  let best = NICE[0];
  for (const n of NICE) if (Math.abs(n - raw) < Math.abs(best - raw)) best = n;
  return best;
}

/** Builds a blind structure for the given template and starting stack. */
export function buildStructure(template: BlindTemplateId, startingStack: number): BlindLevel[] {
  const unit = niceUnit(startingStack);
  if (template === "cash") {
    return [{ sb: unit, bb: unit * 2, ante: 0, minutes: 0 }];
  }
  const minutes = BLIND_TEMPLATES[template].minutes;
  const levels: BlindLevel[] = [];
  SB_LADDER.forEach((mult, i) => {
    const sb = mult * unit;
    const bb = sb * 2;
    levels.push({ sb, bb, ante: i >= 5 ? bb : 0, minutes });
    // A break after every 6 playing levels.
    if ((i + 1) % 6 === 0 && i < SB_LADDER.length - 1) {
      levels.push({ sb: 0, bb: 0, ante: 0, minutes: 10, isBreak: true });
    }
  });
  return levels;
}

export function levelDurationMs(level: BlindLevel | undefined): number {
  return level && level.minutes > 0 ? level.minutes * 60_000 : Number.POSITIVE_INFINITY;
}

function clampIndex(structure: BlindLevel[], i: number) {
  return Math.min(Math.max(0, i), Math.max(0, structure.length - 1));
}

/** Computes what the timer shows right now. Levels advance automatically while running. */
export function computeTimer(structure: BlindLevel[], state: TimerState, now: Date): TimerView {
  let idx = clampIndex(structure, state.blindLevel);
  const view = (status: TimerStatus, remainingMs: number, levelEndsAt: Date | null): TimerView => ({
    status,
    levelIndex: idx,
    level: structure[idx],
    nextLevel: structure[idx + 1] ?? null,
    remainingMs,
    levelEndsAt,
  });

  if (state.pausedRemainingMs != null) {
    return view("paused", state.pausedRemainingMs, null);
  }
  if (!state.levelStartedAt) {
    return view("idle", levelDurationMs(structure[idx]), null);
  }

  let start = state.levelStartedAt.getTime();
  const t = now.getTime();
  for (;;) {
    const dur = levelDurationMs(structure[idx]);
    const end = start + dur;
    const isLast = idx >= structure.length - 1;
    if (t < end || !Number.isFinite(dur)) {
      return view("running", Math.max(0, end - t), Number.isFinite(end) && !isLast ? new Date(end) : null);
    }
    if (isLast) return view("running", 0, null);
    idx += 1;
    start = end;
  }
}

export type TimerAction = "start" | "pause" | "resume" | "next" | "prev" | "reset";

/** Applies a host action to the timer and returns the new persisted state. */
export function applyTimerAction(
  structure: BlindLevel[],
  state: TimerState,
  action: TimerAction,
  now: Date,
): TimerState {
  const cur = computeTimer(structure, state, now);
  const startedFor = (idx: number, remainingMs: number) => {
    const dur = levelDurationMs(structure[idx]);
    const elapsed = Number.isFinite(dur) ? dur - remainingMs : 0;
    return new Date(now.getTime() - elapsed);
  };

  switch (action) {
    case "start":
    case "resume": {
      if (cur.status === "running") return state;
      const remaining = cur.status === "paused" ? cur.remainingMs : levelDurationMs(cur.level);
      return { blindLevel: cur.levelIndex, levelStartedAt: startedFor(cur.levelIndex, remaining), pausedRemainingMs: null };
    }
    case "pause": {
      if (cur.status !== "running") return state;
      const remaining = Number.isFinite(cur.remainingMs) ? Math.round(cur.remainingMs) : null;
      if (remaining == null) return { blindLevel: cur.levelIndex, levelStartedAt: null, pausedRemainingMs: null };
      return { blindLevel: cur.levelIndex, levelStartedAt: null, pausedRemainingMs: remaining };
    }
    case "next":
    case "prev": {
      const idx = clampIndex(structure, cur.levelIndex + (action === "next" ? 1 : -1));
      const dur = levelDurationMs(structure[idx]);
      if (cur.status === "running") return { blindLevel: idx, levelStartedAt: now, pausedRemainingMs: null };
      if (cur.status === "paused")
        return { blindLevel: idx, levelStartedAt: null, pausedRemainingMs: Number.isFinite(dur) ? dur : null };
      return { blindLevel: idx, levelStartedAt: null, pausedRemainingMs: null };
    }
    case "reset":
      return { blindLevel: 0, levelStartedAt: null, pausedRemainingMs: null };
  }
}

export function formatBlinds(level: BlindLevel, lang: Lang = getFormatLang()): string {
  if (level.isBreak) return translate(lang, "blinds.break");
  const base = `${fmt(level.sb)}/${fmt(level.bb)}`;
  return level.ante ? translate(lang, "blinds.withAnte", { blinds: base, ante: fmt(level.ante) }) : base;
}

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return "∞";
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

function fmt(n: number) {
  return fmtChips(n);
}
