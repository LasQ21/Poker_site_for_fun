import { z } from "zod";
import { requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { chatByPublicId, endSeason, startSeason } from "@/lib/server/leaderboard";
import { escapeHtml, notifyChat } from "@/lib/telegram/api";
import { translate } from "@/lib/i18n";
import { langOfUser } from "@/lib/server/users";

type Ctx = { params: Promise<{ publicId: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const viewer = await requireViewer();
  const chat = await chatByPublicId((await params).publicId);
  const { name } = z.object({ name: z.string().min(1).max(60) }).parse(await req.json());
  const season = await startSeason(chat.id, viewer.id, name);
  await notifyChat(chat.id, translate(await langOfUser(viewer.id), "msg.seasonStarted", { name: escapeHtml(season.name) }));
  return json({ season });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const viewer = await requireViewer();
  const chat = await chatByPublicId((await params).publicId);
  return json({ season: await endSeason(chat.id, viewer.id) });
});
