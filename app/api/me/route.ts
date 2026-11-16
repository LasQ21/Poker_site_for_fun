import { getViewer } from "@/lib/server/viewer";
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
