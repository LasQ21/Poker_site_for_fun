import { gameVersion } from "./games";

type Probe = NonNullable<Awaited<ReturnType<typeof gameVersion>>>;
type Listener = (v: Probe | null) => void;

interface Watch {
  listeners: Set<Listener>;
  last: Probe | null | undefined;
  timer: ReturnType<typeof setInterval>;
  busy: boolean;
}

const POLL_MS = 1000;
const watches = new Map<string, Watch>();

/**
 * Subscribes to version changes of a game. All live connections to the same game on this server
 * instance share one probe query per second. Returns an unsubscribe function.
 */
export function watchGame(gameId: string, listener: Listener): () => void {
  let w = watches.get(gameId);
  if (!w) {
    const watch: Watch = {
      listeners: new Set(),
      last: undefined,
      busy: false,
      timer: setInterval(async () => {
        if (watch.busy) return;
        watch.busy = true;
        try {
          const v = await gameVersion(gameId);
          const prev = watch.last;
          if (prev === undefined || v?.version !== prev?.version || v?.status !== prev?.status || v?.idle !== prev?.idle) {
            watch.last = v;
            if (prev !== undefined) for (const l of watch.listeners) l(v);
          }
        } catch (e) {
          console.error("[live] probe failed", e);
        } finally {
          watch.busy = false;
        }
      }, POLL_MS),
    };
    watches.set(gameId, watch);
    w = watch;
  }
  w.listeners.add(listener);
  return () => {
    const cur = watches.get(gameId);
    if (!cur) return;
    cur.listeners.delete(listener);
    if (!cur.listeners.size) {
      clearInterval(cur.timer);
      watches.delete(gameId);
    }
  };
}
