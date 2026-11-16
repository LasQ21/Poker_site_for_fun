import { webhookCallback } from "grammy";
import { createBot } from "@/lib/bot";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

let handler: ((req: Request) => Promise<Response>) | undefined;

export async function POST(req: Request) {
  if (!config.botToken || !config.webhookSecret) return new Response("bot not configured", { status: 503 });
  // grammY also checks this header; checking first avoids creating the bot for junk requests.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== config.webhookSecret) {
    return new Response("unauthorized", { status: 401 });
  }
  handler ??= webhookCallback(createBot(), "std/http", {
    secretToken: config.webhookSecret,
    onTimeout: "return",
    timeoutMilliseconds: 25_000,
  });
  return handler(req);
}
