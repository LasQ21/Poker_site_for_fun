import { getViewer, requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { createGame, listGamesForUser } from "@/lib/server/games";
import { createGameSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const viewer = await getViewer();
  if (!viewer) return json({ games: [] });
  const status = new URL(req.url).searchParams.get("status");
  const games = await listGamesForUser(viewer.id, {
    status: status === "active" || status === "finished" ? status : undefined,
    limit: 100,
  });
  return json({ games });
});

export const POST = route(async (req: Request) => {
  const viewer = await requireViewer();
  const input = createGameSchema.parse(await req.json());
  const game = await createGame(viewer, input);
  return json({ game }, { status: 201 });
});
