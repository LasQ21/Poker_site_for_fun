import { json, route } from "@/lib/server/http";
import { canManageSeasons, chatByPublicId, loadLeaderboard } from "@/lib/server/leaderboard";
import { getViewer } from "@/lib/server/viewer";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, { params }: { params: Promise<{ publicId: string }> }) => {
  const { publicId } = await params;
  const [chat, viewer] = await Promise.all([chatByPublicId(publicId), getViewer()]);
  const s = new URL(req.url).searchParams.get("season") ?? "current";
  const season = s === "all" || s === "current" ? s : Number(s) || "current";
  const [data, canManage] = await Promise.all([
    loadLeaderboard(chat.id, season),
    viewer ? canManageSeasons(chat.id, viewer.id) : false,
  ]);
  return json({ ...data, canManageSeasons: canManage });
});
