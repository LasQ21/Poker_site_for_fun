/**
 * Drives the bot with fake Telegram updates against a real Postgres.
 * Runs only when TEST_DATABASE_URL is set, e.g.:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/poker npm test
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Update } from "grammy/types";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("bot (integration)", () => {
  let bot: Awaited<ReturnType<typeof import("./index")["createBot"]>>;
  const sent: { method: string; payload: Record<string, unknown> }[] = [];
  const CHAT = { id: -100777, type: "supergroup" as const, title: "Test group" };
  const HOST = { id: 9001, is_bot: false, first_name: "Хост" };
  const ANNA = { id: 9002, is_bot: false, first_name: "Анна" };
  const IVAN = { id: 9003, is_bot: false, first_name: "Іван" };
  const OLHA = { id: 9004, is_bot: false, first_name: "Ольга" };
  let updateId = 1;
  let messageId = 1;

  const msg = (from: typeof HOST, text: string, chat: { id: number; type: "supergroup" | "private"; title?: string } = CHAT): Update => ({
    update_id: updateId++,
    message: {
      message_id: messageId++,
      date: Math.floor(Date.now() / 1000),
      chat: chat as never,
      from,
      text,
      entities: text.startsWith("/") ? [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] : undefined,
    },
  });
  const lastText = () => String(sent.filter((s) => s.method === "sendMessage" || s.method === "editMessageText").at(-1)?.payload.text);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.BOT_TOKEN = "";
    const { db } = await import("@/lib/db");
    const { chats, users } = await import("@/lib/db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    await db.delete(chats).where(eq(chats.id, CHAT.id));
    const { games } = await import("@/lib/db/schema");
    await db.delete(games).where(inArray(games.hostUserId, [HOST.id, ANNA.id, IVAN.id, OLHA.id]));
    await db.delete(users).where(inArray(users.id, [HOST.id, ANNA.id, IVAN.id, OLHA.id]));
    const { createBot } = await import("./index");
    bot = createBot("123:test", {
      id: 1,
      is_bot: true,
      first_name: "Poker",
      username: "test_poker_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    } as never);
    bot.api.config.use(async (_prev, method, payload) => {
      sent.push({ method, payload: payload as Record<string, unknown> });
      return { ok: true, result: method === "sendMessage" ? { message_id: messageId++, chat: CHAT, date: 0 } : true } as never;
    });
  });

  it("runs a full tournament from the group chat", async () => {
    await bot.handleUpdate(msg(HOST, "/newgame"));
    expect(lastText()).toContain("Яку гру створити");

    await bot.handleUpdate({
      update_id: updateId++,
      callback_query: {
        id: "cb1",
        from: HOST,
        chat_instance: "x",
        data: "ng:tournament",
        message: { message_id: 1, date: 0, chat: CHAT, text: "Яку гру створити?" },
      },
    });
    expect(lastText()).toContain("створено");
    const code = lastText().match(/Код гри: <b>(\d{4})<\/b>/)?.[1];
    expect(code).toMatch(/^\d{4}$/);

    // Join by code from a private chat.
    const dm = (u: typeof HOST) => ({ id: u.id, type: "private" as const });
    await bot.handleUpdate(msg(IVAN, "/join 0000", dm(IVAN)));
    expect(lastText()).toContain("не знайдено");
    await bot.handleUpdate(msg(IVAN, `/join ${code}`, dm(IVAN)));
    expect(lastText()).toContain("Іван за столом");

    // Host pre-adds a seat without Telegram; Olha joins by code and claims it.
    const G = await import("@/lib/server/games");
    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const game = await G.findActiveGameByCode(code!);
    const [hostUser] = await db.select().from(users).where(eq(users.id, HOST.id));
    const seat = await G.addPlayer(game.id, hostUser, "Оля");
    await bot.handleUpdate(msg(OLHA, `/join ${code}`, dm(OLHA)));
    expect(lastText()).toContain("Хто ви?");
    await bot.handleUpdate({
      update_id: updateId++,
      callback_query: {
        id: "cb2",
        from: OLHA,
        chat_instance: "y",
        data: `seat:${game.id}:${seat.id}`,
        message: { message_id: 2, date: 0, chat: dm(OLHA) as never, text: "Хто ви?" },
      },
    });
    expect(lastText()).toContain("Оля за столом");
    expect((await G.playerForUser(game.id, OLHA.id))?.id).toBe(seat.id);
    await G.removePlayer(game.id, seat.id, hostUser);
    const ivan = await G.playerForUser(game.id, IVAN.id);
    await G.removePlayer(game.id, ivan!.id, hostUser);

    await bot.handleUpdate(msg(ANNA, "/rebuy"));
    expect(lastText()).toContain("/join");

    await bot.handleUpdate(msg(ANNA, "/join"));
    expect(lastText()).toContain("за столом");

    // No stack counting during play: /stack is gone, rebuys are tracked.
    await bot.handleUpdate(msg(ANNA, "/rebuy 5000"));
    expect(lastText()).toContain("ребай 5");

    await bot.handleUpdate(msg(ANNA, "/endgame"));
    expect(lastText()).toContain("лише хост");

    await bot.handleUpdate(msg(HOST, "/standings"));
    expect(lastText()).toContain("Анна — у грі · 2 БІ");

    // Two players still in: the host is sent to the app to enter final stacks.
    await bot.handleUpdate(msg(HOST, "/endgame"));
    expect(lastText()).toContain("Внесіть їхні стеки");

    await bot.handleUpdate(msg(HOST, "/out"));
    await bot.handleUpdate(msg(HOST, "/standings"));
    expect(lastText()).toContain("2. <s>Хост</s>");
    await bot.handleUpdate(msg(HOST, "/endgame"));
    expect(lastText()).toContain("завершено");
    expect(lastText()).toMatch(/🥇 Анна — 4 очк/);

    await bot.handleUpdate(msg(ANNA, "/stats"));
    expect(lastText()).toContain("Анна");
    expect(lastText()).toContain("1 🥇");
    expect(lastText()).toContain("4 очк.");

    const profile = await import("@/lib/server/profile");
    const [anna] = await db.select().from(users).where(eq(users.id, ANNA.id));
    const p = await profile.loadProfile(anna, `u:${HOST.id}`);
    expect(p.stats.tournament).toMatchObject({ games: 1, points: 1, bestPlace: 2 });
    await expect(profile.loadProfile(null, `u:${HOST.id}`)).rejects.toThrow();

    await bot.handleUpdate(msg(HOST, "/leaderboard"));
    expect(lastText()).toContain("Анна — 4 очк.");

    await bot.handleUpdate(msg(HOST, "/season new Зима"));
    expect(lastText()).toContain("Зима");
    await bot.handleUpdate(msg(HOST, "/leaderboard"));
    expect(lastText()).toContain("Ще немає завершених ігор");

    await bot.handleUpdate(msg(HOST, "/history"));
    expect(lastText()).toContain("Останні ігри");
  });
});
