import { getViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { loadProfile } from "@/lib/server/profile";
import { unauthorized } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/profile?key=u:123[&chat=<publicId>] — player stats (all games, or one group's games). */
export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const viewer = await getViewer();
  const key = sp.get("key") || (viewer ? `u:${viewer.id}` : null);
  if (!key) throw unauthorized();
  return json(await loadProfile(viewer, key, sp.get("chat")), { headers: { "Cache-Control": "no-store" } });
});
