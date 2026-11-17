"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { api, etagFetcher, responseTime } from "./api";
import { applyOptimistic } from "./optimistic";
import { haptic } from "./telegram";
import type { GameStateDTO } from "@/lib/types";
import type { GameActionInput } from "@/lib/server/schemas";

/** Polling used when the live stream is unavailable, and as a safety net while it is up. */
const POLL_FALLBACK_MS = 3500;
/** Safety-net polling while the stream is up, and the polling of finished games (they rarely change). */
const POLL_SLOW_MS = 30_000;

/**
 * Server clock minus client clock, measured when the state arrived. Using the receive time (not
 * "now") keeps it right for SWR-cached responses; null for locally built (optimistic) data.
 */
function clockOffsetOf(data: GameStateDTO | undefined): number | null {
  const at = data ? responseTime(data) : undefined;
  return data && at != null ? data.serverNow - at : null;
}

/**
 * Live game state: Server-Sent Events push "something changed" and the state is refetched with an
 * ETag (304 when nothing changed); falls back to polling. `act` applies optimistic updates.
 */
export function useGame(id: string, opts: { poll?: boolean } = {}) {
  const live = useLiveVersion(id, opts.poll !== false);
  const swr = useSWR<GameStateDTO>(`/api/games/${id}`, etagFetcher, {
    // Finished games are still watched (slowly without the stream): the host may reopen them.
    refreshInterval: (data) =>
      opts.poll === false ? 0 : live.connected || data?.game.status === "finished" ? POLL_SLOW_MS : POLL_FALLBACK_MS,
    revalidateOnFocus: true,
    dedupingInterval: 500,
  });
  const [clockOffset, setClockOffset] = useState(() => clockOffsetOf(swr.data) ?? 0);

  useEffect(() => {
    const offset = clockOffsetOf(swr.data);
    if (offset != null) setClockOffset(offset);
  }, [swr.data]);

  const { mutate, data } = swr;
  const dataRef = useRef(data);
  dataRef.current = data;

  // Every pushed `update` → refetch (a cheap 304 when only e.g. `idle` changed); on (re)connect
  // (`hello`) only when the version differs from what we show.
  useEffect(() => {
    if (live.version == null) return;
    if (live.event === "update" || live.version !== dataRef.current?.game.version) void mutate();
  }, [live.version, live.event, live.tick, mutate]);

  const act = useCallback(
    async (action: GameActionInput) => {
      const current = dataRef.current;
      const optimistic = current ? applyOptimistic(current, action) : null;
      const send = () => api(`/api/games/${id}/action`, "POST", action);
      if (optimistic) {
        haptic("light");
        await mutate(
          async () => {
            await send();
            return undefined;
          },
          { optimisticData: optimistic, rollbackOnError: true, populateCache: false, revalidate: true },
        );
      } else {
        await send();
        await mutate();
      }
      haptic("success");
    },
    [id, mutate],
  );

  return { ...swr, clockOffset, act, live: live.connected };
}

/**
 * Subscribes to /api/games/:id/stream while the page is visible — finished games included, so a
 * reopened game shows up live for everyone.
 */
function useLiveVersion(id: string, enabled: boolean) {
  const [state, setState] = useState<{
    connected: boolean;
    version: number | null;
    event: "hello" | "update" | null;
    tick: number;
  }>({ connected: false, version: null, event: null, tick: 0 });

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;

    const onData = (e: MessageEvent) => {
      try {
        const v = JSON.parse(e.data) as { version: number; status: string } | null;
        if (!v) return;
        const event = e.type === "update" ? "update" : "hello";
        setState((s) => ({ connected: true, version: v.version, event, tick: s.tick + 1 }));
      } catch {}
    };
    const open = () => {
      if (es || document.visibilityState !== "visible") return;
      es = new EventSource(`/api/games/${id}/stream`);
      es.addEventListener("hello", onData as EventListener);
      es.addEventListener("update", onData as EventListener);
      es.onerror = () => setState((s) => (s.connected ? { ...s, connected: false } : s));
    };
    const close = () => {
      es?.close();
      es = null;
      setState((s) => (s.connected ? { ...s, connected: false } : s));
    };
    const onVisibility = () => (document.visibilityState === "visible" ? open() : close());

    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [id, enabled]);

  return state;
}

/** Re-renders every `ms` milliseconds and returns the current time. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
