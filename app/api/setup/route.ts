import { timingSafeEqual } from "node:crypto";
import { Api } from "grammy";
import { appUrl, config } from "@/lib/config";
import { botCommands } from "@/lib/bot";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function secretOk(given: string | null) {
  const expected = config.setupSecret;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * One-time bot configuration: webhook, command lists and the Mini App menu button.
 * POST only, secret in the `x-setup-secret` header (never in the URL, where it would end up in logs).
 */
export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-setup-secret"))) {
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
  // Ukrainian is the default; Telegram clients in English get English commands and description.
  for (const lang of ["uk", "en"] as const) {
    const language_code = lang === "uk" ? undefined : lang;
    results[`privateCommands_${lang}`] = await api.setMyCommands(botCommands("private", lang), { scope: { type: "all_private_chats" }, language_code });
    results[`groupCommands_${lang}`] = await api.setMyCommands(botCommands("group", lang), { scope: { type: "all_group_chats" }, language_code });
    results[`description_${lang}`] = await api
      .setMyShortDescription(translate(lang, "bot.shortDescription"), { language_code })
      .catch((e: Error) => e.message);
  }
  results.menuButton = await api.setChatMenuButton({
    menu_button: { type: "web_app", text: translate("uk", "bot.menuButton"), web_app: { url: base } },
  });
  results.webhookInfo = await api.getWebhookInfo();
  return Response.json({ ok: true, appUrl: base, results });
}

