import { requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { loadCircleLeaderboard } from "@/lib/server/leaderboard";

export const dynamic = "force-dynamic";

/** Leaderboard of everyone the viewer plays with (all their games, not one group). */
export const GET = route(async () => {
  const viewer = await requireViewer();
  return json(await loadCircleLeaderboard(viewer.id), { headers: { "Cache-Control": "no-store" } });
});
