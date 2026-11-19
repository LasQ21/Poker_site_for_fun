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

/** Where the bot posts: a group chat and, in forum groups, a topic (message_thread_id). */
export type ChatTarget = { chatId: number | null; topicId?: number | null };

const isMissingTopic = (e: unknown) => /thread not found|TOPIC_(CLOSED|DELETED|ID_INVALID)/i.test(String((e as Error)?.message ?? e));

/** Sends to the topic; if the topic was deleted or closed, falls back to the general chat. */
async function withTopic(topicId: number | null | undefined, send: (extra: { message_thread_id?: number }) => Promise<unknown>) {
  if (topicId) {
    try {
      return await send({ message_thread_id: topicId });
    } catch (e) {
      if (!isMissingTopic(e)) throw e;
      console.warn("[tg] topic unavailable, posting to the general chat", topicId);
    }
  }
  return send({});
}

/** Best-effort message to a chat (or its poker topic); failures are logged, never thrown. */
export async function notifyChat(target: ChatTarget, html: string, markup?: InlineKeyboardMarkup) {
  const a = tgApi();
  if (!a || target.chatId == null) return;
  const chatId = target.chatId;
  try {
    await withTopic(target.topicId, (extra) =>
      a.sendMessage(chatId, html, {
        ...extra,
        parse_mode: "HTML",
        reply_markup: markup,
        link_preview_options: { is_disabled: true },
      }),
    );
  } catch (e) {
    console.error("[tg] sendMessage failed", e);
  }
}

export async function sendCsv(target: ChatTarget, filename: string, csv: string, caption?: string) {
  const a = tgApi();
  if (!a || target.chatId == null) return;
  const chatId = target.chatId;
  try {
    await withTopic(target.topicId, (extra) =>
      a.sendDocument(chatId, new InputFile(Buffer.from(csv, "utf8"), filename), { ...extra, caption }),
    );
  } catch (e) {
    console.error("[tg] sendDocument failed", e);
  }
}
