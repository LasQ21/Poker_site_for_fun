"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBlinds, formatClock, levelDurationMs, type TimerAction } from "@/lib/game/blinds";
import { useAppBack } from "@/lib/client/nav";
import { tr, useT } from "@/lib/i18n/client";
import { exitFullscreen, getWebApp, isFullscreen, requestFullscreen, useBackButton } from "@/lib/client/telegram";
import { unlockAudio, useTimer } from "@/lib/client/timer";
import { useGame } from "@/lib/client/useGame";
import { fmtChips } from "@/lib/format";
import type { GameStateDTO } from "@/lib/types";
import { useToast } from "@/components/AppShell";
import { IconNext, IconPause, IconPlay, IconPrev } from "@/components/icons";
import { Empty, PageLoader } from "@/components/ui";

/** Keeps the screen awake while mounted (re-acquired when the tab becomes visible again). */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release(): Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    let disposed = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const l = await nav.wakeLock!.request("screen");
        if (disposed) void l.release();
        else lock = l;
      } catch {}
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/** Mini App: go fullscreen while on this page and restore the previous mode on leave. */
function useMiniAppFullscreen() {
  useEffect(() => {
    if (!getWebApp() || isFullscreen()) return;
    requestFullscreen();
    return () => exitFullscreen();
  }, []);
}

export default function TvPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { data: state, error, isLoading, clockOffset, act } = useGame(gameId);
  const back = useAppBack(`/g/${gameId}`);
  useBackButton(back);
  useWakeLock();
  useMiniAppFullscreen();

  if (isLoading) return <PageLoader />;
  if (error || !state) return <Empty icon="🤷" title={tr("errors.gameNotFound")}>{error?.message}</Empty>;
  return <TvBoard state={state} clockOffset={clockOffset} act={act} onExit={back} />;
}

function TvBoard({
  state,
  clockOffset,
  act,
  onExit,
}: {
  state: GameStateDTO;
  clockOffset: number;
  act: ReturnType<typeof useGame>["act"];
  onExit: () => void;
}) {
  const { game } = state;
  const toast = useToast();
  const t = useT();
  const v = useTimer(game, clockOffset);
  const [browserFs, setBrowserFs] = useState(false);
  const host = state.role === "host" && game.status === "active";
  const dur = levelDurationMs(v.level);
  const progress = Number.isFinite(dur) ? Math.min(1, Math.max(0, 1 - v.remainingMs / dur)) : 0;
  const lastMinute = v.status === "running" && v.remainingMs < 60_000 && !!v.nextLevel;
  const levelNo = game.blindStructure.slice(0, v.levelIndex + 1).filter((l) => !l.isBreak).length;
  const upcoming = game.blindStructure.slice(v.levelIndex + 1, v.levelIndex + 4);
  const alive = state.players.filter((p) => p.status === "active");
  const top = [...alive].sort((a, b) => b.currentChips - a.currentChips).slice(0, 5);
  const avg = alive.length ? state.check.totalStacks / alive.length : 0;
  const bb = v.level.isBreak ? (game.blindStructure.slice(0, v.levelIndex).reverse().find((l) => !l.isBreak)?.bb ?? 0) : v.level.bb;

  const timer = async (a: TimerAction) => {
    unlockAudio();
    try {
      await act({ action: "timer", timer: a });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  useEffect(() => {
    const onFs = () => setBrowserFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden text-white"
      style={{
        background: "radial-gradient(120% 90% at 50% 20%, var(--felt) 0%, var(--felt-2) 70%, #020a07 100%)",
        paddingTop: "max(12px, var(--safe-top))",
        paddingBottom: "max(12px, var(--safe-bottom))",
      }}
    >
      <header className="flex items-center gap-3 px-5">
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-[clamp(1rem,2.4vw,1.6rem)] font-bold">{game.name}</div>
          <div className="text-[clamp(.75rem,1.4vw,1rem)] font-semibold text-white/60">
            {v.level.isBreak ? t("blinds.break") : t("timer.level", { n: levelNo })} · {t("tv.inGame", { alive: alive.length, total: state.players.length })}
            {avg > 0 && ` · ${t("tv.avg", { n: fmtChips(avg) })}${bb ? ` (${Math.round(avg / bb)} BB)` : ""}`}
          </div>
        </div>
        {game.joinCode && game.status === "active" && !state.idle && (
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">{t("tv.code")}</div>
            <div className="font-display text-[clamp(1.2rem,3vw,2rem)] font-bold leading-none tracking-[0.15em]">{game.joinCode}</div>
          </div>
        )}
        {!getWebApp() && typeof document !== "undefined" && document.fullscreenEnabled && (
          <button
            type="button"
            className="rounded-full bg-white/10 px-3 py-2 text-sm font-bold"
            aria-label={t("tv.fullscreen")}
            onClick={() => (browserFs ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
          >
            {browserFs ? "⤡" : "⤢"}
          </button>
        )}
        <button type="button" aria-label={t("tv.exit")} onClick={onExit} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg">
          ✕
        </button>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 px-5 pt-2 landscape:grid-cols-[1.5fr_1fr] portrait:grid-rows-[auto_1fr]">
        <section className="flex min-h-0 flex-col items-center justify-center text-center">
          <div
            className={`font-display font-bold leading-none tabular ${lastMinute ? "text-[#ff8a80]" : ""}`}
            style={{ fontSize: "min(24vw, 34vh)" }}
            aria-live="off"
          >
            {formatClock(v.remainingMs)}
          </div>
          <div className="font-display mt-2 font-bold tabular" style={{ fontSize: "min(8vw, 11vh)" }}>
            {v.level.isBreak ? t("tv.breakBig") : `${fmtChips(v.level.sb)} / ${fmtChips(v.level.bb)}`}
          </div>
          {!v.level.isBreak && v.level.ante > 0 && (
            <div className="font-semibold text-white/70" style={{ fontSize: "min(3.5vw, 5vh)" }}>
              {t("blinds.ante", { n: fmtChips(v.level.ante) })}
            </div>
          )}
          <div className="mt-3 text-[clamp(.9rem,2vw,1.4rem)] font-semibold text-white/65">
            {v.status === "paused"
              ? t("tv.paused")
              : v.status === "idle"
                ? t("tv.idle")
                : v.nextLevel
                  ? t("tv.next", { blinds: formatBlinds(v.nextLevel) })
                  : t("timer.last")}
          </div>
          {host && (
            <div className="mt-4 flex items-center gap-4">
              <TvBtn label={t("timer.prev")} onClick={() => timer("prev")} disabled={v.levelIndex === 0}>
                <IconPrev width={22} height={22} />
              </TvBtn>
              {v.status === "running" ? (
                <TvBtn label={t("timer.pause")} big onClick={() => timer("pause")}>
                  <IconPause width={28} height={28} />
                </TvBtn>
              ) : (
                <TvBtn label={t("timer.start")} big onClick={() => timer(v.status === "paused" ? "resume" : "start")}>
                  <IconPlay width={28} height={28} />
                </TvBtn>
              )}
              <TvBtn label={t("timer.nextLevel")} onClick={() => timer("next")} disabled={!v.nextLevel}>
                <IconNext width={22} height={22} />
              </TvBtn>
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-hidden portrait:flex-col-reverse portrait:justify-end">
          <div className="shrink-0 rounded-3xl bg-black/25 p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">{t("tv.upcoming")}</div>
            {upcoming.length ? (
              upcoming.map((l, i) => (
                <div key={i} className="flex justify-between py-1 text-[clamp(.9rem,1.8vw,1.25rem)] font-semibold tabular">
                  <span>{l.isBreak ? t("tv.breakBig") : formatBlinds(l)}</span>
                  <span className="text-white/55">{l.minutes ? t("common.minutes", { n: l.minutes }) : "∞"}</span>
                </div>
              ))
            ) : (
              <div className="text-white/60">{t("tv.lastLevel")}</div>
            )}
          </div>
          <div className="min-h-0 shrink-0 rounded-3xl bg-black/25 p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">{t("tv.leaders")}</div>
            {top.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-1 text-[clamp(.9rem,1.8vw,1.25rem)] font-semibold">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-white/50 tabular">{i + 1}</span>
                  {p.displayName}
                </span>
                <span className="tabular">
                  {fmtChips(p.currentChips)}
                  {bb > 0 && <span className="ml-2 text-white/55">{Math.round(p.currentChips / bb)} BB</span>}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </main>

      <div className="mx-5 mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${progress * 100}%`, background: v.level.isBreak ? "var(--gold)" : lastMinute ? "#ff8a80" : "rgba(255,255,255,.8)" }}
        />
      </div>
    </div>
  );
}

function TvBtn({ children, onClick, disabled, big, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; big?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid place-items-center rounded-full bg-white/12 transition active:scale-90 disabled:opacity-30 ${big ? "h-16 w-16" : "h-12 w-12"}`}
    >
      {children}
    </button>
  );
}
