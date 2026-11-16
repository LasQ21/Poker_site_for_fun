import { timingSafeEqual } from "node:crypto";
import { Api } from "grammy";
import { appUrl, config } from "@/lib/config";
import { GROUP_COMMANDS, PRIVATE_COMMANDS } from "@/lib/bot";

export const dynamic = "force-dynamic";

function secretOk(given: string | null) {
  const expected = config.setupSecret;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** One-time bot configuration: webhook, command lists and the Mini App menu button. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!secretOk(req.headers.get("x-setup-secret") ?? url.searchParams.get("secret"))) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!config.botToken || !config.webhookSecret) {
    return Response.json({ error: "BOT_TOKEN and WEBHOOK_SECRET must be set" }, { status: 400 });
  }
  const api = new Api(config.botToken);
  const base = appUrl();
  const results: Record<string, unknown> = {};
  results.me = await api.getMe();
  results.webhook = await api.setWebhook(`${base}/api/bot`, {
    secret_token: config.webhookSecret,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: true,
  });
  results.privateCommands = await api.setMyCommands(PRIVATE_COMMANDS, { scope: { type: "all_private_chats" } });
  results.groupCommands = await api.setMyCommands(GROUP_COMMANDS, { scope: { type: "all_group_chats" } });
  results.menuButton = await api.setChatMenuButton({
    menu_button: { type: "web_app", text: "Покер", web_app: { url: base } },
  });
  results.description = await api
    .setMyShortDescription("Облік стеків у домашньому покері: кеш і турніри, таймер блайндів, лідерборд.")
    .catch((e: Error) => e.message);
  results.webhookInfo = await api.getWebhookInfo();
  return Response.json({ ok: true, appUrl: base, results });
}

export const GET = POST;
