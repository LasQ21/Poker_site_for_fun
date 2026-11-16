import { getViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { listGamesForUser } from "@/lib/server/games";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const viewer = await getViewer();
  if (!viewer) return json({ games: [] });
  return json({ games: await listGamesForUser(viewer.id, { status: "finished", limit: 200 }) });
});
