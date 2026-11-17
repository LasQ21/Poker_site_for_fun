import { json, route } from "@/lib/server/http";
import { canManageSeasons, chatByPublicId, isChatMember, loadLeaderboard, redactLeaderboard } from "@/lib/server/leaderboard";
import { getViewer } from "@/lib/server/viewer";

export const dynamic = "force-dynamic";

/** Public leaderboard of a group. Telegram ids are only shown to members of that group. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ publicId: string }> }) => {
  const { publicId } = await params;
  const [chat, viewer] = await Promise.all([chatByPublicId(publicId), getViewer()]);
  const s = new URL(req.url).searchParams.get("season") ?? "current";
  const season = s === "all" || s === "current" ? s : Number(s) || "current";
  const [data, member] = await Promise.all([
    loadLeaderboard(chat.id, season),
    viewer ? isChatMember(chat.id, viewer.id) : false,
  ]);
  const canManage = member && viewer ? await canManageSeasons(chat.id, viewer.id) : false;
  return json({ ...(member ? data : redactLeaderboard(data)), canManageSeasons: canManage });
});
