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

  it("remembers the poker topic of a forum group", async () => {
    const FORUM = { id: -100778, type: "supergroup" as const, title: "Forum", is_forum: true };
    const { db } = await import("@/lib/db");
    const { chats, games } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(chats).where(eq(chats.id, FORUM.id));
    const inTopic = (text: string, topic?: number): Update => {
      const u = msg(HOST, text, FORUM as never);
      if (topic) Object.assign(u.message!, { message_thread_id: topic, is_topic_message: true });
      return u;
    };

    await bot.handleUpdate(inTopic("/topic"));
    expect(lastText()).toContain("у тій гілці");

    // Starting a game inside the "Poker" topic makes it the group's topic.
    await bot.handleUpdate(inTopic("/newgame", 42));
    expect(sent.at(-1)?.payload.message_thread_id).toBe(42);
    await bot.handleUpdate({
      update_id: updateId++,
      callback_query: {
        id: "cb3",
        from: HOST,
        chat_instance: "z",
        data: "ng:cash",
        message: { message_id: 9, date: 0, chat: FORUM, text: "Яку гру створити?", message_thread_id: 42, is_topic_message: true } as never,
      },
    });
    expect(lastText()).toContain("писатиме в цю гілку");
    const [chat] = await db.select().from(chats).where(eq(chats.id, FORUM.id));
    expect(chat.topicId).toBe(42);
    const [game] = await db.select().from(games).where(eq(games.chatId, FORUM.id));
    expect(game.topicId).toBe(42);

    // Moving to another topic moves active games too; /topic off goes back to the general chat.
    await bot.handleUpdate(inTopic("/topic", 77));
    expect(lastText()).toContain("Готово");
    expect((await db.select().from(games).where(eq(games.chatId, FORUM.id)))[0].topicId).toBe(77);
    await bot.handleUpdate(inTopic("/topic off", 77));
    expect((await db.select().from(chats).where(eq(chats.id, FORUM.id)))[0].topicId).toBeNull();
    await db.delete(games).where(eq(games.chatId, FORUM.id));
    await db.delete(chats).where(eq(chats.id, FORUM.id));
  });

  it("hands name-only seats to the linked Telegram user on first visit", async () => {
    const BODYA = { id: 9010, is_bot: false, first_name: "Богдан", username: "Q4R8T7" };
    const KOSTYA = { id: 9011, is_bot: false, first_name: "Костянтин", username: "obrkos" };
    const { db } = await import("@/lib/db");
    const { games, players, users, playerLinks } = await import("@/lib/db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const G = await import("@/lib/server/games");
    await db.delete(users).where(inArray(users.id, [BODYA.id, KOSTYA.id]));
    // Seed links from the migration (re-created here in case the table was cleaned).
    if (!(await db.select().from(playerLinks).where(eq(playerLinks.username, "q4r8t7"))).length) {
      await db.insert(playerLinks).values([{ username: "q4r8t7", nameKey: "бодя" }, { username: "obrkos", nameKey: "костя" }]);
    }
    const [host] = await db.select().from(users).where(eq(users.id, HOST.id));
    const game = await G.createGame(host, { type: "cash", startingStack: 10_000, playerNames: ["Бодя", "Даня"] });
    const seats = await db.select().from(players).where(eq(players.gameId, game.id));
    expect(seats.find((p) => p.displayName === "Бодя")?.userId).toBeNull();
    const state = await G.loadGameState(game.id);
    expect(state.players.find((p) => p.displayName === "Бодя")?.linkUsername).toBe("q4r8t7");

    // Bodya opens the bot for the first time → the seat is his.
    await bot.handleUpdate(msg(BODYA, "/start", { id: BODYA.id, type: "private" }));
    expect((await G.playerForUser(game.id, BODYA.id))?.displayName).toBe("Бодя");

    // A known user is seated as himself when the host adds his name.
    await bot.handleUpdate(msg(KOSTYA, "/start", { id: KOSTYA.id, type: "private" }));
    const added = await G.addPlayer(game.id, host, "Костя");
    expect(added.userId).toBe(KOSTYA.id);

    // The host links a new name by username.
    const res = await G.linkPlayerUsername(game.id, seats.find((p) => p.displayName === "Даня")!.id, host, "t.me/spchless_test");
    expect(res).toEqual({ username: "spchless_test", claimed: 0 });
    await db.delete(games).where(eq(games.id, game.id));
    await db.delete(playerLinks).where(eq(playerLinks.username, "spchless_test"));
    await db.delete(users).where(inArray(users.id, [BODYA.id, KOSTYA.id]));
  });
});
