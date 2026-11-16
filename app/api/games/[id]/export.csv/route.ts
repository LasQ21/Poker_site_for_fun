import { route } from "@/lib/server/http";
import { gameCsv, loadGameState } from "@/lib/server/games";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const state = await loadGameState(id);
  const filename = `${state.game.name}.csv`;
  return new Response(gameCsv(state), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="game-${id}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
