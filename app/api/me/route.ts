import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { forgetViewer, getViewer, requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { chatsForUser } from "@/lib/server/leaderboard";
import { appUrl, config, ensureBotUsername, miniAppLink } from "@/lib/config";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const [user] = await Promise.all([getViewer(), ensureBotUsername()]);
  return json({
    user,
    chats: user ? await chatsForUser(user.id) : [],
    botUsername: config.botUsername || null,
    devLogin: config.devLogin,
    miniAppBase: config.botUsername && config.miniAppShortName ? miniAppLink() : null,
    appUrl: appUrl(),
  });
});

/** Saves the interface language chosen in settings (null = follow Telegram). */
export const PATCH = route(async (req: Request) => {
  const viewer = await requireViewer();
  const { lang } = z.object({ lang: z.enum(["uk", "en"]).nullable() }).parse(await req.json());
  await db.update(users).set({ lang }).where(eq(users.id, viewer.id));
  forgetViewer(viewer.id);
  return json({ ok: true });
});
