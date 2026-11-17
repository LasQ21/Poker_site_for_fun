import { getViewer, requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { deleteGame, gameStateForViewer, loadGameState, updateGame } from "@/lib/server/games";
import { updateGameSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const [state, viewer] = await Promise.all([loadGameState(id), getViewer()]);
  return json(gameStateForViewer(state, viewer), { headers: { "Cache-Control": "no-store" } });
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
