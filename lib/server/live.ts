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

const changed = (a: Probe | null, b: Probe | null) =>
  a?.version !== b?.version || a?.status !== b?.status || a?.idle !== b?.idle;

/**
 * Subscribes to version changes of a game. All live connections to the same game on this server
 * instance share one probe query per second. `initial` is the probe the caller already sent to its
 * client: a new watch compares the first tick against it, so a change in between is not missed.
 * Returns an unsubscribe function.
 */
export function watchGame(gameId: string, listener: Listener, initial?: Probe | null): () => void {
  let w = watches.get(gameId);
  if (!w) {
    const watch: Watch = {
      listeners: new Set(),
      last: initial,
      busy: false,
      timer: setInterval(async () => {
        if (watch.busy) return;
        watch.busy = true;
        try {
          const v = await gameVersion(gameId);
          const prev = watch.last;
          if (prev === undefined || changed(v, prev)) {
            watch.last = v;
            if (prev !== undefined) {
              for (const l of [...watch.listeners]) {
                try {
                  l(v);
                } catch (e) {
                  console.error("[live] listener failed", e);
                }
              }
            }
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
  } else if (initial !== undefined && w.last !== undefined && changed(initial, w.last)) {
    // Joining an existing watch whose last probe differs from what this client was sent: catch it up.
    const last = w.last;
    queueMicrotask(() => {
      try {
        listener(last);
      } catch (e) {
        console.error("[live] listener failed", e);
      }
    });
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
