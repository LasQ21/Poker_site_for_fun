import { requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { actionSchema } from "@/lib/server/schemas";
import * as G from "@/lib/server/games";
import { escapeHtml, notifyChat, sendCsv, urlButton } from "@/lib/telegram/api";
import { ensureBotUsername, gameWebUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** All game mutations go through one endpoint; permissions are checked in lib/server/games. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const [viewer] = await Promise.all([requireViewer(), ensureBotUsername()]);
  const a = actionSchema.parse(await req.json());
  let result: unknown = null;
  switch (a.action) {
    case "addPlayer":
      result = await G.addPlayer(id, viewer, a.displayName);
      break;
    case "join":
      result = await G.joinGame(id, viewer, a.playerId);
      break;
    case "updatePlayer":
      await G.updatePlayer(id, a.playerId, viewer, a);
      break;
    case "linkUsername":
      result = await G.linkPlayerUsername(id, a.playerId, viewer, a.username);
      break;
    case "removePlayer":
      await G.removePlayer(id, a.playerId, viewer);
      break;
    case "buyin":
      result = await G.addBuyin(id, a.playerId, viewer, a.kind, a.chips);
      break;
    case "deleteBuyin":
      await G.deleteBuyin(id, a.buyinId, viewer);
      break;
    case "bust":
      result = await G.bustPlayer(id, a.playerId, viewer);
      break;
    case "unbust":
      await G.unbustPlayer(id, a.playerId, viewer);
      break;
    case "timer":
      await G.timerAction(id, viewer, a.timer);
      break;
    case "end": {
      const state = await G.endGame(id, viewer, a.finalStacks);
      if (state.game.chatId) {
        await notifyChat(G.gameTarget(state.game), G.summaryText(state), urlButton("📊 Підсумок", `${gameWebUrl(id)}/summary`));
        await sendCsv(G.gameTarget(state.game), `${state.game.name.replace(/[^\p{L}\p{N}_-]+/gu, "_")}.csv`, G.gameCsv(state), escapeHtml(state.game.name));
      }
      break;
    }
    case "reopen":
      await G.reopenGame(id, viewer);
      break;
  }
  return json({ ok: true, result });
});
