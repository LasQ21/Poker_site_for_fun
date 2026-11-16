import { json, route } from "@/lib/server/http";
import { chatByPublicId, loadLeaderboard } from "@/lib/server/leaderboard";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, { params }: { params: Promise<{ publicId: string }> }) => {
  const { publicId } = await params;
  const chat = await chatByPublicId(publicId);
  const s = new URL(req.url).searchParams.get("season") ?? "current";
  const season = s === "all" || s === "current" ? s : Number(s) || "current";
  return json(await loadLeaderboard(chat.id, season));
});
