import { gameVersion } from "@/lib/server/games";
import { watchGame } from "@/lib/server/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Connections are closed before the function limit; EventSource reconnects on its own. */
const LIFETIME_MS = 55_000;
const PING_MS = 15_000;

/**
 * Server-Sent Events: `update` whenever the game changes (payload: version only — no game data,
 * so no auth is needed; clients refetch the state with their own credentials).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const first = await gameVersion(id);
  if (!first) return new Response("not found", { status: 404 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(enc.encode(chunk));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {}
      };
      send(`retry: 1500\nevent: hello\ndata: ${JSON.stringify(first)}\n\n`);
      const unwatch = watchGame(id, (v) => {
        send(`event: update\ndata: ${JSON.stringify(v)}\n\n`);
        if (!v) close();
      });
      const ping = setInterval(() => send(`: ping\n\n`), PING_MS);
      const end = setTimeout(close, LIFETIME_MS);
      cleanup = () => {
        unwatch();
        clearInterval(ping);
        clearTimeout(end);
      };
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
