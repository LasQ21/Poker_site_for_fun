import { requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { loadPlayerStats } from "@/lib/server/stats";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const viewer = await requireViewer();
  const stats = await loadPlayerStats(viewer.id);
  return json({
    user: {
      id: viewer.id,
      firstName: viewer.firstName,
      lastName: viewer.lastName,
      username: viewer.username,
      photoUrl: viewer.photoUrl,
    },
    stats,
  });
});
