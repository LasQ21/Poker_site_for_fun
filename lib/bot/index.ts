import { Bot, Context, InlineKeyboard } from "grammy";
import type { BotCommand, UserFromGetMe } from "grammy/types";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { appUrl, config, gameWebUrl, miniAppLink, setDetectedBotUsername } from "@/lib/config";
import { fmtBuyins, fmtChips, fmtDate } from "@/lib/format";
import { parseChips } from "@/lib/game/parse";
import { AppError } from "@/lib/server/errors";
import * as G from "@/lib/server/games";
import { activeSeason, endSeason, loadLeaderboard, startSeason } from "@/lib/server/leaderboard";
import { forgetChatMembers, removeMember, touchMember, upsertChat, upsertUser } from "@/lib/server/users";
import { escapeHtml, sendCsv } from "@/lib/telegram/api";

const isGroup = (ctx: Context) => ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";

export const PRIVATE_COMMANDS: BotCommand[] = [
  { command: "start", description: "Відкрити покер-трекер" },
  { command: "join", description: "Приєднатися за кодом: /join 1234" },
  { command: "newgame", description: "Створити гру" },
  { command: "history", description: "Мої останні ігри" },
  { command: "help", description: "Довідка" },
];

export const GROUP_COMMANDS: BotCommand[] = [
  { command: "newgame", description: "Нова гра (кеш або турнір)" },
  { command: "join", description: "Сісти за стіл: /join або /join 1234" },
  { command: "stack", description: "Оновити свій стек: /stack 12500" },
  { command: "rebuy", description: "Ребай (можна вказати суму)" },
  { command: "out", description: "Вибув (турнір)" },
  { command: "standings", description: "Поточна таблиця" },
  { command: "endgame", description: "Завершити гру (хост)" },
  { command: "leaderboard", description: "Лідерборд сезону" },
  { command: "season", description: "Сезон: /season new <назва> | /season end" },
  { command: "history", description: "Останні ігри групи" },
  { command: "help", description: "Довідка" },
];

const HELP = `<b>Покер-трекер</b> — облік стеків у домашній грі (без грошей, лише фішки та очки).

<b>У групі:</b>
/newgame — створити гру (кеш чи турнір)
/join — сісти за стіл (або /join 1234 — за кодом гри, працює і в приваті)
/stack 12500 — оновити свій стек
/rebuy — ребай (або /rebuy 5000)
/out — вибув із турніру
/standings — таблиця
/endgame — завершити (хост): підсумок + CSV
/leaderboard — лідерборд сезону
/season new Осінь — новий сезон, /season end — завершити
/history — останні ігри

Решта — у застосунку: таймер блайндів, графік стеків, бай-іни.`;

function gameButton(gameId: string, text = "🃏 Відкрити гру") {
  return new InlineKeyboard().url(text, miniAppLink(gameId));
}

async function userFromCtx(ctx: Context) {
  if (!ctx.from) throw new AppError(400, "Невідомий користувач");
  const [u] = await db.select().from(users).where(eq(users.id, ctx.from.id)).limit(1);
  return u ?? upsertUser(ctx.from);
}

async function requireActiveGame(ctx: Context) {
  if (!isGroup(ctx)) throw new AppError(400, "Ця команда працює в груповому чаті.");
  const game = await G.activeGameInChat(ctx.chat!.id);
  if (!game) throw new AppError(404, "Немає активної гри. Створіть: /newgame");
  return game;
}

async function requireMyPlayer(ctx: Context, gameId: string) {
  const p = await G.playerForUser(gameId, ctx.from!.id);
  if (!p) {
    throw new AppError(
      400,
      "Ви ще не за столом. Напишіть /join або відкрийте застосунок і оберіть своє місце.",
    );
  }
  return p;
}

export function createBot(token = config.botToken, botInfo?: UserFromGetMe) {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);

  // Remember users, groups and who is in which group (for leaderboards and game creation).
  bot.use(async (ctx, next) => {
    setDetectedBotUsername(ctx.me?.username);
    try {
      if (ctx.from && !ctx.from.is_bot) {
        await upsertUser(ctx.from);
        if (isGroup(ctx)) {
          const chat = ctx.chat as { id: number; title?: string };
          await upsertChat(chat.id, chat.title ?? "Група");
          await touchMember(chat.id, ctx.from.id);
        }
      }
    } catch (e) {
      console.error("[bot] tracking failed", e);
    }
    await next();
  });

  const run =
    <C extends Context>(fn: (ctx: C) => Promise<unknown>) =>
    async (ctx: C) => {
      try {
        await fn(ctx);
      } catch (e) {
        const msg = e instanceof AppError ? e.message : "Щось пішло не так 😕";
        if (!(e instanceof AppError)) console.error("[bot]", e);
        if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: msg, show_alert: true }).catch(() => {});
        else await ctx.reply(msg).catch(() => {});
      }
    };

  // Keep chat_members in sync: it gates game creation in the group and its leaderboard/seasons.
  bot.on("my_chat_member", run(async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const chat = ctx.myChatMember.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;
    if (status === "left" || status === "kicked") await forgetChatMembers(chat.id);
    else await upsertChat(chat.id, chat.title ?? "Група");
  }));

  bot.on("message:left_chat_member", run(async (ctx) => {
    const left = ctx.message.left_chat_member;
    if (left.id === ctx.me.id) await forgetChatMembers(ctx.chat.id);
    else if (!left.is_bot) await removeMember(ctx.chat.id, left.id);
  }));

  bot.on("message:new_chat_members", run(async (ctx) => {
    for (const u of ctx.message.new_chat_members) {
      if (u.is_bot) continue;
      await upsertUser(u);
      await touchMember(ctx.chat.id, u.id);
    }
  }));

  bot.command(["start", "help"], run(async (ctx) => {
    if (isGroup(ctx)) {
      await ctx.reply(HELP, { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("🃏 Застосунок", miniAppLink()) });
      return;
    }
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const url = /^\d{4}$/.test(payload)
      ? `${appUrl()}/join/${payload}`
      : payload
        ? `${appUrl()}/g/${encodeURIComponent(payload)}`
        : appUrl();
    await ctx.reply(
      ctx.message?.text?.startsWith("/help")
        ? HELP
        : `Привіт, ${escapeHtml(ctx.from?.first_name ?? "")}! 👋\nТут можна вести облік стеків у домашньому покері: кеш і турніри, таймер блайндів, графік і лідерборд.\n\nДодайте мене в групу друзів і напишіть там /newgame.`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().webApp("🃏 Відкрити", url) },
    );
  }));

  bot.command("newgame", run(async (ctx) => {
    if (!isGroup(ctx)) {
      await ctx.reply("Створіть гру в застосунку або напишіть /newgame у груповому чаті.", {
        reply_markup: new InlineKeyboard().webApp("➕ Нова гра", `${appUrl()}/new`),
      });
      return;
    }
    const existing = await G.activeGameInChat(ctx.chat!.id);
    const note = existing
      ? `\n\n⚠️ Уже є активна гра «${escapeHtml(existing.name)}»${G.isIdle(existing) ? " (неактивна понад добу)" : ""}.`
      : "";
    await ctx.reply(`Яку гру створити?${note}`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("💵 Кеш", "ng:cash").text("🏆 Турнір", "ng:tournament"),
    });
  }));

  bot.callbackQuery(/^ng:(cash|tournament)$/, run(async (ctx) => {
    const type = ctx.match![1] as "cash" | "tournament";
    const user = await userFromCtx(ctx);
    const chatId = ctx.chat!.id;
    const game = await G.createGame(user, {
      type,
      startingStack: 10_000,
      chatId,
      reminderIntervalMin: 30,
      hostPlays: true,
    });
    await ctx.answerCallbackQuery({ text: "Гру створено!" });
    await ctx.editMessageText(
      `🃏 <b>${escapeHtml(game.name)}</b> створено!\nХост: ${escapeHtml(user.firstName)} · стартовий стек ${fmtChips(game.startingStack)}\n\n` +
        `Код гри: <b>${game.joinCode}</b>\nСідайте за стіл: /join (тут) або /join ${game.joinCode} (будь-де), чи кнопка нижче.`,
      { parse_mode: "HTML", reply_markup: gameButton(game.id) },
    );
  }));

  /** Seats the sender, or asks which pre-added seat is theirs when the host added names without Telegram. */
  async function seatOrAsk(ctx: Context, game: Awaited<ReturnType<typeof G.getGame>>) {
    const user = await userFromCtx(ctx);
    if (await G.playerForUser(game.id, user.id)) {
      await ctx.reply(`Ви вже за столом у «${escapeHtml(game.name)}».`, { parse_mode: "HTML", reply_markup: gameButton(game.id) });
      return;
    }
    const state = await G.loadGameState(game.id);
    const free = state.players.filter((p) => p.userId == null);
    if (free.length) {
      const kb = new InlineKeyboard();
      free.slice(0, 12).forEach((p, i) => {
        kb.text(`Я — ${p.displayName}`, `seat:${game.id}:${p.id}`);
        if (i % 2 === 1) kb.row();
      });
      kb.row().text("➕ Новим гравцем", `seat:${game.id}:new`);
      await ctx.reply(`«${escapeHtml(game.name)}»: хост уже вписав кількох гравців. Хто ви?`, {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      return;
    }
    const p = await G.joinGame(game.id, user);
    await ctx.reply(`✅ ${escapeHtml(p.displayName)} за столом «${escapeHtml(game.name)}» зі стеком ${fmtChips(game.startingStack)}.`, {
      parse_mode: "HTML",
      reply_markup: gameButton(game.id),
    });
  }

  bot.command("join", run(async (ctx) => {
    const arg = String(ctx.match ?? "").trim();
    if (arg) {
      if (!G.JOIN_CODE_RE.test(arg)) throw new AppError(400, "Код гри — це 4 цифри, напр.: /join 4821");
      await seatOrAsk(ctx, await G.findGameByCodeLimited(ctx.from!.id, arg));
      return;
    }
    if (!isGroup(ctx)) throw new AppError(400, "Напишіть код гри, який показує хост: /join 4821");
    await seatOrAsk(ctx, await requireActiveGame(ctx));
  }));

  bot.callbackQuery(/^seat:([A-Za-z0-9_-]+):(new|\d+)$/, run(async (ctx) => {
    const [, gameId, seat] = ctx.match!;
    const user = await userFromCtx(ctx);
    const p = await G.joinGame(gameId, user, seat === "new" ? undefined : Number(seat));
    await ctx.answerCallbackQuery({ text: `Ви — ${p.displayName}` });
    await ctx.editMessageText(`✅ ${escapeHtml(p.displayName)} за столом.`, { parse_mode: "HTML", reply_markup: gameButton(gameId) });
  }));

  bot.command("stack", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const chips = parseChips(String(ctx.match ?? ""));
    if (chips == null) throw new AppError(400, "Вкажіть стек числом, напр.: /stack 12500");
    const user = await userFromCtx(ctx);
    const p = await requireMyPlayer(ctx, game.id);
    await G.setStack(game.id, p.id, user, chips);
    const state = await G.loadGameState(game.id);
    const me = state.results.find((r) => r.playerId === p.id);
    await ctx.reply(
      `📝 ${escapeHtml(p.displayName)}: ${fmtChips(chips)}` +
        (me && game.type === "cash" ? ` (${me.netChips >= 0 ? "+" : ""}${fmtChips(me.netChips)}, ${fmtBuyins(me.netBuyins)})` : ""),
      { parse_mode: "HTML" },
    );
  }));

  bot.command("rebuy", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const arg = String(ctx.match ?? "").trim();
    const chips = arg ? parseChips(arg) : undefined;
    if (chips === null || chips === 0) throw new AppError(400, "Вкажіть суму числом, напр.: /rebuy 10000");
    const user = await userFromCtx(ctx);
    const p = await requireMyPlayer(ctx, game.id);
    const { stack } = await G.addBuyin(game.id, p.id, user, "rebuy", chips ?? undefined);
    await ctx.reply(`🔁 ${escapeHtml(p.displayName)}: ребай ${fmtChips(chips ?? game.startingStack)}, стек ${fmtChips(stack)}.`, {
      parse_mode: "HTML",
    });
  }));

  bot.command("out", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const user = await userFromCtx(ctx);
    const p = await requireMyPlayer(ctx, game.id);
    await G.bustPlayer(game.id, p.id, user);
    if (game.type === "cash") await ctx.reply(`👋 ${escapeHtml(p.displayName)} без фішок. /rebuy — щоб повернутися.`);
  }));

  bot.command("standings", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const state = await G.loadGameState(game.id);
    const code = state.idle
      ? "\n\n💤 Гра неактивна понад добу, код звільнено. Будь-яка дія за столом її відновить, або хост: /endgame"
      : state.game.joinCode
        ? `\n\nКод гри: <b>${state.game.joinCode}</b>`
        : "";
    await ctx.reply(`📊 <b>${escapeHtml(game.name)}</b>\n\n${G.standingsText(state)}${code}`, {
      parse_mode: "HTML",
      reply_markup: gameButton(game.id),
    });
  }));

  bot.command("endgame", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const user = await userFromCtx(ctx);
    if (!G.isHost(game, user.id)) throw new AppError(403, "Завершити гру може лише хост.");
    const state = await G.endGame(game.id, user);
    await ctx.reply(G.summaryText(state), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("📊 Підсумок", `${gameWebUrl(game.id)}/summary`),
    });
    await sendCsv(ctx.chat!.id, `game-${game.id}.csv`, G.gameCsv(state), game.name);
  }));

  bot.command("leaderboard", run(async (ctx) => {
    if (!isGroup(ctx)) throw new AppError(400, "Лідерборд ведеться в групі — напишіть /leaderboard там.");
    const lb = await loadLeaderboard(ctx.chat!.id, "current");
    const title = lb.season ? `сезон «${escapeHtml(lb.season.name)}»` : "за весь час";
    const parts: string[] = [`🏆 <b>Лідерборд</b> — ${title}`];
    if (lb.tournament.length) {
      parts.push(
        "\n<b>Турніри (очки):</b>\n" +
          lb.tournament
            .slice(0, 10)
            .map((r, i) => `${i + 1}. ${escapeHtml(r.displayName)} — ${r.points} очк. (${r.wins}🥇 / ${r.games} ігор)`)
            .join("\n"),
      );
    }
    if (lb.cash.length) {
      parts.push(
        "\n<b>Кеш (бай-іни):</b>\n" +
          lb.cash
            .slice(0, 10)
            .map((r, i) => `${i + 1}. ${escapeHtml(r.displayName)} — ${fmtBuyins(r.netBuyins)} (${r.games} ігор)`)
            .join("\n"),
      );
    }
    if (!lb.tournament.length && !lb.cash.length) parts.push("\nЩе немає завершених ігор.");
    await ctx.reply(parts.join("\n"), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("📈 Детально", miniAppLink(`lb_${lb.chat.publicId}`)),
    });
  }));

  bot.command("season", run(async (ctx) => {
    if (!isGroup(ctx)) throw new AppError(400, "Сезони ведуться в групі.");
    const chatId = ctx.chat!.id;
    const arg = String(ctx.match ?? "").trim();
    const user = await userFromCtx(ctx);
    if (/^(new|нов\S*)\s+/i.test(arg)) {
      const name = arg.replace(/^\S+\s+/, "");
      const s = await startSeason(chatId, user.id, name);
      await ctx.reply(`🏁 Новий сезон: <b>${escapeHtml(s.name)}</b>. Нові ігри групи рахуються в нього.`, { parse_mode: "HTML" });
      return;
    }
    if (/^(end|stop|заверш\S*)$/i.test(arg)) {
      const s = await endSeason(chatId, user.id);
      await ctx.reply(s ? `Сезон «${escapeHtml(s.name)}» завершено. Підсумки: /leaderboard` : "Активного сезону немає.", {
        parse_mode: "HTML",
      });
      return;
    }
    const s = await activeSeason(chatId);
    await ctx.reply(
      s
        ? `Поточний сезон: <b>${escapeHtml(s.name)}</b> (з ${fmtDate(s.startsAt)}).\n/season new &lt;назва&gt; — новий, /season end — завершити.`
        : "Сезон не запущено — лідерборд рахується за весь час.\n/season new &lt;назва&gt; — запустити сезон.",
      { parse_mode: "HTML" },
    );
  }));

  bot.command("history", run(async (ctx) => {
    const list = isGroup(ctx)
      ? await G.listGamesForChat(ctx.chat!.id, { status: "finished", limit: 8 })
      : await G.listGamesForUser(ctx.from!.id, { status: "finished", limit: 8 });
    if (!list.length) {
      await ctx.reply("Завершених ігор ще немає.");
      return;
    }
    const lines = list.map(
      (g) =>
        `• <a href="${gameWebUrl(g.id)}/summary">${escapeHtml(g.name)}</a> — ${fmtDate(g.finishedAt)}, ${g.playerCount} гравців` +
        (g.winner ? `, 🥇 ${escapeHtml(g.winner)}` : ""),
    );
    await ctx.reply(`🗂 <b>Останні ігри</b>\n\n${lines.join("\n")}`, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }));

  bot.catch((err) => console.error("[bot] unhandled", err.error));
  return bot;
}
