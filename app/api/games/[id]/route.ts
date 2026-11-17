import { getViewer, requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { deleteGame, gameEtag, gameStateForViewer, gameVersion, loadGameState, updateGame } from "@/lib/server/games";
import { notFound } from "@/lib/server/errors";
import { updateGameSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Full game state. Clients send `If-None-Match` with the last ETag: while nothing changed the answer
 * is a 304 after a single one-row query instead of the full state.
 */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const [probe, viewer] = await Promise.all([gameVersion(id), getViewer()]);
  if (!probe) throw notFound("Гру не знайдено");
  const headers = { "Cache-Control": "private, no-cache", Vary: "Authorization, Cookie" };
  const inm = req.headers.get("if-none-match");
  if (inm && inm === gameEtag(probe, viewer?.id)) {
    return new Response(null, { status: 304, headers: { ...headers, ETag: inm } });
  }
  const state = await loadGameState(id);
  return json(gameStateForViewer(state, viewer), {
    headers: { ...headers, ETag: gameEtag({ version: state.game.version, idle: state.idle }, viewer?.id) },
  });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const viewer = await requireViewer();
  const input = updateGameSchema.parse(await req.json());
  const game = await updateGame(id, viewer, input);
  return json({ game });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const viewer = await requireViewer();
  await deleteGame(id, viewer);
  return json({ ok: true });
});
