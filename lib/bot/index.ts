import { Bot, Context, InlineKeyboard } from "grammy";
import type { BotCommand, UserFromGetMe } from "grammy/types";
import { appUrl, config, gameWebUrl, miniAppLink, setDetectedBotUsername } from "@/lib/config";
import { fmtBuyins, fmtChips, fmtDate } from "@/lib/format";
import { parseChips } from "@/lib/game/parse";
import { makeT, translate, type Key, type Lang, type T } from "@/lib/i18n";
import { AppError } from "@/lib/server/errors";
import * as G from "@/lib/server/games";
import { activeSeason, endSeason, loadLeaderboard, startSeason } from "@/lib/server/leaderboard";
import { forgetChatMembers, langOfUser, removeMember, touchMember, upsertChat, upsertUser, userLang } from "@/lib/server/users";
import { escapeHtml, sendCsv } from "@/lib/telegram/api";
import type { User } from "@/lib/db/schema";

/** Context with the reply language: private chats use the sender's, groups the active game host's. */
type Ctx = Context & { lang: Lang; t: T; user?: User };

const isGroup = (ctx: Context) => ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";

const PRIVATE: [string, Key][] = [
  ["start", "cmd.start"],
  ["join", "cmd.joinPrivate"],
  ["newgame", "cmd.newgamePrivate"],
  ["history", "cmd.historyPrivate"],
  ["help", "cmd.help"],
];
const GROUP: [string, Key][] = [
  ["newgame", "cmd.newgame"],
  ["join", "cmd.join"],
  ["stack", "cmd.stack"],
  ["rebuy", "cmd.rebuy"],
  ["out", "cmd.out"],
  ["standings", "cmd.standings"],
  ["endgame", "cmd.endgame"],
  ["leaderboard", "cmd.leaderboard"],
  ["season", "cmd.season"],
  ["history", "cmd.history"],
  ["help", "cmd.help"],
];

export function botCommands(scope: "private" | "group", lang: Lang): BotCommand[] {
  return (scope === "private" ? PRIVATE : GROUP).map(([command, key]) => ({ command, description: translate(lang, key) }));
}

export const PRIVATE_COMMANDS = botCommands("private", "uk");
export const GROUP_COMMANDS = botCommands("group", "uk");

function gameButton(ctx: Ctx, gameId: string, key: Key = "bot.openGame") {
  return new InlineKeyboard().url(ctx.t(key), miniAppLink(gameId));
}

async function userFromCtx(ctx: Ctx): Promise<User> {
  if (!ctx.from) throw new AppError(400, "errors.unknownUser");
  return ctx.user ?? (ctx.user = await upsertUser(ctx.from));
}

async function requireActiveGame(ctx: Ctx) {
  if (!isGroup(ctx)) throw new AppError(400, "errors.groupOnly");
  const game = await G.activeGameInChat(ctx.chat!.id);
  if (!game) throw new AppError(404, "errors.noActiveGame");
  return game;
}

async function requireMyPlayer(ctx: Ctx, gameId: string) {
  const p = await G.playerForUser(gameId, ctx.from!.id);
  if (!p) throw new AppError(400, "errors.notSeated");
  return p;
}

export function createBot(token = config.botToken, botInfo?: UserFromGetMe) {
  const bot = new Bot<Ctx>(token, botInfo ? { botInfo } : undefined);

  // Remember users, groups and who is in which group (for leaderboards and game creation),
  // and pick the reply language.
  bot.use(async (ctx, next) => {
    setDetectedBotUsername(ctx.me?.username);
    try {
      if (ctx.from && !ctx.from.is_bot) {
        ctx.user = await upsertUser(ctx.from);
        if (isGroup(ctx)) {
          const chat = ctx.chat as { id: number; title?: string };
          await upsertChat(chat.id, chat.title ?? "Group");
          await touchMember(chat.id, ctx.from.id);
        }
      }
    } catch (e) {
      console.error("[bot] tracking failed", e);
    }
    let lang: Lang = userLang(ctx.user ?? { lang: null, languageCode: ctx.from?.language_code ?? null });
    if (isGroup(ctx)) {
      try {
        const game = await G.activeGameInChat(ctx.chat!.id);
        if (game) lang = await langOfUser(game.hostUserId);
      } catch {}
    }
    ctx.lang = lang;
    ctx.t = makeT(lang);
    await next();
  });

  const run =
    <C extends Ctx>(fn: (ctx: C) => Promise<unknown>) =>
    async (ctx: C) => {
      try {
        await fn(ctx);
      } catch (e) {
        const msg = e instanceof AppError ? e.text(ctx.lang) : ctx.t("common.somethingWrong");
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
    else await upsertChat(chat.id, chat.title ?? "Group");
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
      await ctx.reply(ctx.t("bot.help"), { parse_mode: "HTML", reply_markup: new InlineKeyboard().url(ctx.t("bot.app"), miniAppLink()) });
      return;
    }
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const url = /^\d{4}$/.test(payload)
      ? `${appUrl()}/join/${payload}`
      : payload
        ? `${appUrl()}/g/${encodeURIComponent(payload)}`
        : appUrl();
    await ctx.reply(
      ctx.message?.text?.startsWith("/help") ? ctx.t("bot.help") : ctx.t("bot.welcome", { name: escapeHtml(ctx.from?.first_name ?? "") }),
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().webApp(ctx.t("bot.open"), url) },
    );
  }));

  bot.command("newgame", run(async (ctx) => {
    if (!isGroup(ctx)) {
      await ctx.reply(ctx.t("bot.newgamePrivate"), {
        reply_markup: new InlineKeyboard().webApp(ctx.t("bot.newGameBtn"), `${appUrl()}/new`),
      });
      return;
    }
    const existing = await G.activeGameInChat(ctx.chat!.id);
    const note = existing
      ? ctx.t("bot.existing", { name: escapeHtml(existing.name), idle: G.isIdle(existing) ? ctx.t("bot.idleSuffix") : "" })
      : "";
    await ctx.reply(ctx.t("bot.whichGame", { note }), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(ctx.t("bot.cashBtn"), "ng:cash").text(ctx.t("bot.tournamentBtn"), "ng:tournament"),
    });
  }));

  bot.callbackQuery(/^ng:(cash|tournament)$/, run(async (ctx) => {
    const type = ctx.match![1] as "cash" | "tournament";
    const user = await userFromCtx(ctx);
    const game = await G.createGame(user, {
      type,
      startingStack: 10_000,
      chatId: ctx.chat!.id,
      reminderIntervalMin: 30,
      hostPlays: true,
    });
    // The new game's host decides the group's language from now on.
    const t = makeT(await langOfUser(user.id));
    await ctx.answerCallbackQuery({ text: t("bot.createdToast") });
    await ctx.editMessageText(
      t("bot.created", {
        name: escapeHtml(game.name),
        host: escapeHtml(user.firstName),
        stack: fmtChips(game.startingStack),
        code: game.joinCode,
      }),
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().url(t("bot.openGame"), miniAppLink(game.id)) },
    );
  }));

  /** Seats the sender, or asks which pre-added seat is theirs when the host added names without Telegram. */
  async function seatOrAsk(ctx: Ctx, game: Awaited<ReturnType<typeof G.getGame>>) {
    const user = await userFromCtx(ctx);
    if (await G.playerForUser(game.id, user.id)) {
      await ctx.reply(ctx.t("bot.alreadySeated", { name: escapeHtml(game.name) }), { parse_mode: "HTML", reply_markup: gameButton(ctx, game.id) });
      return;
    }
    const state = await G.loadGameState(game.id);
    const free = state.players.filter((p) => p.userId == null);
    if (free.length) {
      const kb = new InlineKeyboard();
      free.slice(0, 12).forEach((p, i) => {
        kb.text(ctx.t("bot.iAm", { name: p.displayName }), `seat:${game.id}:${p.id}`);
        if (i % 2 === 1) kb.row();
      });
      kb.row().text(ctx.t("bot.asNew"), `seat:${game.id}:new`);
      await ctx.reply(ctx.t("bot.whoAreYou", { name: escapeHtml(game.name) }), { parse_mode: "HTML", reply_markup: kb });
      return;
    }
    const p = await G.joinGame(game.id, user);
    await ctx.reply(
      ctx.t("bot.seated", { name: escapeHtml(p.displayName), game: escapeHtml(game.name), stack: fmtChips(game.startingStack) }),
      { parse_mode: "HTML", reply_markup: gameButton(ctx, game.id) },
    );
  }

  bot.command("join", run(async (ctx) => {
    const arg = String(ctx.match ?? "").trim();
    if (arg) {
      if (!G.JOIN_CODE_RE.test(arg)) throw new AppError(400, "errors.codeFormatBot");
      await seatOrAsk(ctx, await G.findGameByCodeLimited(ctx.from!.id, arg));
      return;
    }
    if (!isGroup(ctx)) throw new AppError(400, "errors.codeNeeded");
    await seatOrAsk(ctx, await requireActiveGame(ctx));
  }));

  bot.callbackQuery(/^seat:([A-Za-z0-9_-]+):(new|\d+)$/, run(async (ctx) => {
    const [, gameId, seat] = ctx.match!;
    const user = await userFromCtx(ctx);
    const p = await G.joinGame(gameId, user, seat === "new" ? undefined : Number(seat));
    await ctx.answerCallbackQuery({ text: ctx.t("bot.youAre", { name: p.displayName }) });
    await ctx.editMessageText(ctx.t("bot.seatedShort", { name: escapeHtml(p.displayName) }), {
      parse_mode: "HTML",
      reply_markup: gameButton(ctx, gameId),
    });
  }));

  bot.command("stack", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const chips = parseChips(String(ctx.match ?? ""));
    if (chips == null) throw new AppError(400, "errors.stackRequired");
    const user = await userFromCtx(ctx);
    const p = await requireMyPlayer(ctx, game.id);
    await G.setStack(game.id, p.id, user, chips);
    const state = await G.loadGameState(game.id);
    const me = state.results.find((r) => r.playerId === p.id);
    const net =
      me && game.type === "cash"
        ? ctx.t("bot.stackNet", { net: `${me.netChips >= 0 ? "+" : ""}${fmtChips(me.netChips)}`, bi: fmtBuyins(me.netBuyins, ctx.lang) })
        : "";
    await ctx.reply(ctx.t("bot.stackSet", { name: escapeHtml(p.displayName), chips: fmtChips(chips) }) + net, { parse_mode: "HTML" });
  }));

  bot.command("rebuy", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const arg = String(ctx.match ?? "").trim();
    const chips = arg ? parseChips(arg) : undefined;
    if (chips === null || chips === 0) throw new AppError(400, "errors.rebuyAmount");
    const user = await userFromCtx(ctx);
    const p = await requireMyPlayer(ctx, game.id);
    const { stack } = await G.addBuyin(game.id, p.id, user, "rebuy", chips ?? undefined);
    await ctx.reply(
      ctx.t("bot.rebuyDone", { name: escapeHtml(p.displayName), chips: fmtChips(chips ?? game.startingStack), stack: fmtChips(stack) }),
      { parse_mode: "HTML" },
    );
  }));

  bot.command("out", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const user = await userFromCtx(ctx);
    const p = await requireMyPlayer(ctx, game.id);
    await G.bustPlayer(game.id, p.id, user);
    if (game.type === "cash") await ctx.reply(ctx.t("bot.cashOut", { name: escapeHtml(p.displayName) }), { parse_mode: "HTML" });
  }));

  bot.command("standings", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const state = await G.loadGameState(game.id);
    const code = state.idle
      ? ctx.t("bot.idleNote")
      : state.game.joinCode
        ? ctx.t("bot.codeNote", { code: state.game.joinCode })
        : "";
    await ctx.reply(ctx.t("bot.standings", { name: escapeHtml(game.name), standings: G.standingsText(state, ctx.lang), code }), {
      parse_mode: "HTML",
      reply_markup: gameButton(ctx, game.id),
    });
  }));

  bot.command("endgame", run(async (ctx) => {
    const game = await requireActiveGame(ctx);
    const user = await userFromCtx(ctx);
    if (!G.isHost(game, user.id)) throw new AppError(403, "errors.endHostOnly");
    const state = await G.endGame(game.id, user);
    await ctx.reply(G.summaryText(state, ctx.lang), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url(ctx.t("msg.summaryBtn"), `${gameWebUrl(game.id)}/summary`),
    });
    await sendCsv(ctx.chat!.id, `game-${game.id}.csv`, G.gameCsv(state, { lang: ctx.lang }), game.name);
  }));

  bot.command("leaderboard", run(async (ctx) => {
    if (!isGroup(ctx)) throw new AppError(400, "errors.leaderboardGroup");
    const { t } = ctx;
    const lb = await loadLeaderboard(ctx.chat!.id, "current");
    const title = lb.season ? t("bot.lbSeason", { name: escapeHtml(lb.season.name) }) : t("bot.lbAllTime");
    const parts: string[] = [t("bot.lbTitle", { title })];
    if (lb.tournament.length) {
      parts.push(
        t("bot.lbTournaments") +
          "\n" +
          lb.tournament
            .slice(0, 10)
            .map((r, i) =>
              t("bot.lbTRow", { i: i + 1, name: escapeHtml(r.displayName), points: r.points, wins: r.wins, games: t("common.games", { n: r.games }) }),
            )
            .join("\n"),
      );
    }
    if (lb.cash.length) {
      parts.push(
        t("bot.lbCash") +
          "\n" +
          lb.cash
            .slice(0, 10)
            .map((r, i) =>
              t("bot.lbCRow", { i: i + 1, name: escapeHtml(r.displayName), bi: fmtBuyins(r.netBuyins, ctx.lang), games: t("common.games", { n: r.games }) }),
            )
            .join("\n"),
      );
    }
    if (!lb.tournament.length && !lb.cash.length) parts.push(t("bot.lbEmpty"));
    await ctx.reply(parts.join("\n"), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url(t("bot.lbDetails"), miniAppLink(`lb_${lb.chat.publicId}`)),
    });
  }));

  bot.command("season", run(async (ctx) => {
    if (!isGroup(ctx)) throw new AppError(400, "errors.seasonsGroup");
    const chatId = ctx.chat!.id;
    const arg = String(ctx.match ?? "").trim();
    const user = await userFromCtx(ctx);
    if (/^(new|нов\S*)\s+/i.test(arg)) {
      const name = arg.replace(/^\S+\s+/, "");
      const s = await startSeason(chatId, user.id, name);
      await ctx.reply(ctx.t("bot.seasonNew", { name: escapeHtml(s.name) }), { parse_mode: "HTML" });
      return;
    }
    if (/^(end|stop|заверш\S*)$/i.test(arg)) {
      const s = await endSeason(chatId, user.id);
      await ctx.reply(s ? ctx.t("bot.seasonEnded", { name: escapeHtml(s.name) }) : ctx.t("bot.noSeason"), { parse_mode: "HTML" });
      return;
    }
    const s = await activeSeason(chatId);
    await ctx.reply(
      s ? ctx.t("bot.seasonCurrent", { name: escapeHtml(s.name), date: fmtDate(s.startsAt, ctx.lang) }) : ctx.t("bot.seasonNone"),
      { parse_mode: "HTML" },
    );
  }));

  bot.command("history", run(async (ctx) => {
    const list = isGroup(ctx)
      ? await G.listGamesForChat(ctx.chat!.id, { status: "finished", limit: 8 })
      : await G.listGamesForUser(ctx.from!.id, { status: "finished", limit: 8 });
    if (!list.length) {
      await ctx.reply(ctx.t("bot.noHistory"));
      return;
    }
    const lines = list.map(
      (g) =>
        `• <a href="${gameWebUrl(g.id)}/summary">${escapeHtml(g.name)}</a> — ${fmtDate(g.finishedAt, ctx.lang)}, ${ctx.t("common.players", { n: g.playerCount })}` +
        (g.winner ? ctx.t("bot.historyWinner", { name: escapeHtml(g.winner) }) : ""),
    );
    await ctx.reply(`${ctx.t("bot.historyTitle")}\n\n${lines.join("\n")}`, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }));

  bot.catch((err) => console.error("[bot] unhandled", err.error));
  return bot;
}
