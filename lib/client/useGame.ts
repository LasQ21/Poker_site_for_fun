"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "./api";
import { haptic } from "./telegram";
import type { GameStateDTO } from "@/lib/types";
import type { GameActionInput } from "@/lib/server/schemas";

/** Game state with ~3.5 s polling (live sync between players) and an action helper. */
export function useGame(id: string, opts: { poll?: boolean } = {}) {
  const swr = useSWR<GameStateDTO>(`/api/games/${id}`, fetcher, {
    refreshInterval: (data) => (opts.poll === false || data?.game.status === "finished" ? 0 : 3500),
    revalidateOnFocus: true,
    dedupingInterval: 1000,
  });
  const [clockOffset, setClockOffset] = useState(0);
  const fetchedAt = useRef(0);

  useEffect(() => {
    if (swr.data) {
      fetchedAt.current = Date.now();
      setClockOffset(swr.data.serverNow - Date.now());
    }
  }, [swr.data]);

  const { mutate } = swr;
  const act = useCallback(
    async (action: GameActionInput) => {
      await api(`/api/games/${id}/action`, "POST", action);
      haptic("success");
      await mutate();
    },
    [id, mutate],
  );

  return { ...swr, clockOffset, act };
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
