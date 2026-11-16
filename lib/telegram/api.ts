import { Api, InputFile } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import { config } from "@/lib/config";

let api: Api | undefined;

export function tgApi(): Api | null {
  if (!config.botToken) return null;
  api ??= new Api(config.botToken);
  return api;
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function urlButton(text: string, url: string): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text, url }]] };
}

/** Best-effort message to a chat; failures are logged, never thrown. */
export async function notifyChat(chatId: number | null, html: string, markup?: InlineKeyboardMarkup) {
  const a = tgApi();
  if (!a || chatId == null) return;
  try {
    await a.sendMessage(chatId, html, {
      parse_mode: "HTML",
      reply_markup: markup,
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    console.error("[tg] sendMessage failed", e);
  }
}

export async function sendCsv(chatId: number, filename: string, csv: string, caption?: string) {
  const a = tgApi();
  if (!a) return;
  try {
    await a.sendDocument(chatId, new InputFile(Buffer.from(csv, "utf8"), filename), { caption });
  } catch (e) {
    console.error("[tg] sendDocument failed", e);
  }
}
