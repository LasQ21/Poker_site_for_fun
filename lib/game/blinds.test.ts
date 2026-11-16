import { describe, expect, it } from "vitest";
import { applyTimerAction, buildStructure, computeTimer, formatClock, niceUnit, type BlindLevel, type TimerState } from "./blinds";

const S: BlindLevel[] = [
  { sb: 25, bb: 50, ante: 0, minutes: 10 },
  { sb: 50, bb: 100, ante: 0, minutes: 10 },
  { sb: 100, bb: 200, ante: 0, minutes: 10 },
];
const T0 = new Date("2026-01-01T20:00:00Z");
const at = (min: number, sec = 0) => new Date(T0.getTime() + min * 60_000 + sec * 1000);
const idle: TimerState = { blindLevel: 0, levelStartedAt: null, pausedRemainingMs: null };

describe("computeTimer", () => {
  it("shows full duration when idle", () => {
    const v = computeTimer(S, idle, T0);
    expect(v).toMatchObject({ status: "idle", levelIndex: 0, remainingMs: 600_000 });
  });

  it("counts down and auto-advances levels", () => {
    const running = { blindLevel: 0, levelStartedAt: T0, pausedRemainingMs: null };
    expect(computeTimer(S, running, at(3)).remainingMs).toBe(420_000);
    const v = computeTimer(S, running, at(12));
    expect(v.levelIndex).toBe(1);
    expect(v.remainingMs).toBe(480_000);
    expect(v.levelEndsAt).toEqual(at(20));
  });

  it("stays on the last level at zero", () => {
    const running = { blindLevel: 0, levelStartedAt: T0, pausedRemainingMs: null };
    const v = computeTimer(S, running, at(45));
    expect(v.levelIndex).toBe(2);
    expect(v.remainingMs).toBe(0);
    expect(v.levelEndsAt).toBeNull();
  });
});

describe("applyTimerAction", () => {
  it("start → pause → resume keeps remaining time", () => {
    let s = applyTimerAction(S, idle, "start", T0);
    expect(computeTimer(S, s, at(4)).remainingMs).toBe(360_000);
    s = applyTimerAction(S, s, "pause", at(4));
    expect(s.pausedRemainingMs).toBe(360_000);
    // time passes while paused
    expect(computeTimer(S, s, at(30)).remainingMs).toBe(360_000);
    s = applyTimerAction(S, s, "resume", at(30));
    expect(computeTimer(S, s, at(31)).remainingMs).toBe(300_000);
    expect(computeTimer(S, s, at(31)).levelIndex).toBe(0);
  });

  it("pause after auto-advance anchors to the computed level", () => {
    let s = applyTimerAction(S, idle, "start", T0);
    s = applyTimerAction(S, s, "pause", at(15));
    expect(s).toEqual({ blindLevel: 1, levelStartedAt: null, pausedRemainingMs: 300_000 });
  });

  it("next/prev restart the level and clamp at bounds", () => {
    let s = applyTimerAction(S, idle, "start", T0);
    s = applyTimerAction(S, s, "next", at(2));
    expect(computeTimer(S, s, at(2))).toMatchObject({ levelIndex: 1, remainingMs: 600_000 });
    s = applyTimerAction(S, s, "next", at(3));
    s = applyTimerAction(S, s, "next", at(4));
    expect(s.blindLevel).toBe(2);
    s = applyTimerAction(S, idle, "prev", T0);
    expect(s.blindLevel).toBe(0);
  });

  it("reset returns to idle level 0", () => {
    const s = applyTimerAction(S, { blindLevel: 2, levelStartedAt: T0, pausedRemainingMs: null }, "reset", at(1));
    expect(s).toEqual(idle);
  });
});

describe("structures", () => {
  it("picks a nice unit and builds increasing blinds", () => {
    expect(niceUnit(10_000)).toBe(25);
    expect(niceUnit(20_000)).toBe(50);
    const s = buildStructure("regular", 10_000).filter((l) => !l.isBreak);
    expect(s[0]).toMatchObject({ sb: 25, bb: 50, minutes: 20 });
    for (let i = 1; i < s.length; i++) expect(s[i].bb).toBeGreaterThan(s[i - 1].bb);
    expect(buildStructure("cash", 10_000)).toEqual([{ sb: 25, bb: 50, ante: 0, minutes: 0 }]);
  });

  it("cash level never runs out", () => {
    const cash = buildStructure("cash", 10_000);
    const v = computeTimer(cash, { blindLevel: 0, levelStartedAt: T0, pausedRemainingMs: null }, at(500));
    expect(v.remainingMs).toBe(Infinity);
    expect(formatClock(v.remainingMs)).toBe("∞");
  });

  it("formats clock", () => {
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});
