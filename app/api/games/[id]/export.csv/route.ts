import { route } from "@/lib/server/http";
import { gameCsv, isParticipant, loadGameState } from "@/lib/server/games";
import { getViewer } from "@/lib/server/viewer";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const [state, viewer] = await Promise.all([loadGameState(id), getViewer()]);
  const filename = `${state.game.name}.csv`;
  return new Response(gameCsv(state, { includeIds: isParticipant(state, viewer?.id) }), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="game-${id}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
});
