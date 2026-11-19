import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  buyins,
  chatMembers,
  chats,
  games,
  players,
  seasons,
  stackSnapshots,
  users,
  type Game,
  type Player,
  type User,
} from "@/lib/db/schema";
import {
  applyTimerAction,
  buildStructure,
  computeTimer,
  formatBlinds,
  type BlindLevel,
  type BlindTemplateId,
  type TimerAction,
} from "@/lib/game/blinds";
import { bustPlace, chipCheck, computeResults, type ResultRow } from "@/lib/game/results";
import { fmtBuyins, fmtChips, fmtSigned } from "@/lib/format";
import { miniAppLink } from "@/lib/config";
import { scheduleJob } from "@/lib/qstash";
import { escapeHtml, notifyChat, urlButton, type ChatTarget } from "@/lib/telegram/api";
import { AppError, badRequest, forbidden, notFound } from "./errors";
import { displayNameOf } from "./users";

export type BuyinKind = "buyin" | "rebuy" | "addon";

export interface PlayerView extends Player {
  currentChips: number;
  buyinChips: number;
  buyinCount: number;
  lastUpdateAt: string | null;
}

export interface GameState {
  game: Game;
  host: { id: number; name: string };
  chat: { title: string; publicId: string } | null;
  players: PlayerView[];
  buyins: { id: number; playerId: number; chips: number; kind: BuyinKind; createdAt: Date }[];
  snapshots: { playerId: number; chips: number; t: number }[];
  results: ResultRow[];
  check: ReturnType<typeof chipCheck>;
}

export const newGameId = () => nanoid(10);

// ---------------------------------------------------------------- join codes

export const JOIN_CODE_RE = /^\d{4}$/;

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/** Gives an active game a fresh 4-digit code (1000–9999) not used by any other active game. */
export async function assignJoinCode(gameId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const rows = await db
      .select({ code: games.joinCode })
      .from(games)
      .where(and(eq(games.status, "active"), isNotNull(games.joinCode)));
    const used = new Set(rows.map((r) => r.code));
    if (used.size >= 8000) throw new AppError(503, "Забагато активних ігор, спробуйте пізніше");
    let code: string;
    do code = String(randomInt(1000, 10000));
    while (used.has(code));
    try {
      await db.update(games).set({ joinCode: code }).where(eq(games.id, gameId));
      return code;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new AppError(503, "Не вдалося згенерувати код гри");
}

export async function findActiveGameByCode(code: string): Promise<Game> {
  const c = code.trim();
  if (!JOIN_CODE_RE.test(c)) throw badRequest("Код гри — це 4 цифри");
  const [g] = await db
    .select()
    .from(games)
    .where(and(eq(games.joinCode, c), eq(games.status, "active")))
    .limit(1);
  if (!g) throw notFound("Гру з таким кодом не знайдено (або її вже завершено)");
  return g;
}

/**
 * Join by code. Seats the user right away unless the host pre-added players without Telegram —
 * then the client lets them pick their seat first.
 */
export async function joinByCode(actor: User, code: string) {
  const game = await findActiveGameByCode(code);
  if (await playerForUser(game.id, actor.id)) return { gameId: game.id, status: "already" as const };
  const [free] = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.gameId, game.id), isNull(players.userId)))
    .limit(1);
  if (free) return { gameId: game.id, status: "choose-seat" as const };
  await joinGame(game.id, actor);
  return { gameId: game.id, status: "joined" as const };
}

// ---------------------------------------------------------------- loading

export async function getGame(gameId: string): Promise<Game> {
  const [g] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!g) throw notFound("Гру не знайдено");
  return g;
}

async function getPlayer(gameId: string, playerId: number): Promise<Player> {
  const [p] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.gameId, gameId)))
    .limit(1);
  if (!p) throw notFound("Гравця не знайдено");
  return p;
}

/** Totals and current stacks for the players of several games at once. */
async function playerAggregates(gameIds: string[]) {
  if (!gameIds.length) return { totals: new Map(), stacks: new Map() };
  const totalsRows = await db
    .select({
      playerId: buyins.playerId,
      chips: sql<number>`coalesce(sum(${buyins.chips}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(buyins)
    .where(inArray(buyins.gameId, gameIds))
    .groupBy(buyins.playerId);
  const stackRows = await db
    .selectDistinctOn([stackSnapshots.playerId], {
      playerId: stackSnapshots.playerId,
      chips: stackSnapshots.chips,
      recordedAt: stackSnapshots.recordedAt,
    })
    .from(stackSnapshots)
    .where(inArray(stackSnapshots.gameId, gameIds))
    .orderBy(stackSnapshots.playerId, desc(stackSnapshots.recordedAt), desc(stackSnapshots.id));
  return {
    totals: new Map<number, { chips: number; count: number }>(totalsRows.map((r) => [r.playerId, r])),
    stacks: new Map<number, { chips: number; recordedAt: Date }>(stackRows.map((r) => [r.playerId, r])),
  };
}

function toPlayerView(
  p: Player,
  agg: Awaited<ReturnType<typeof playerAggregates>>,
): PlayerView {
  const t = agg.totals.get(p.id);
  const s = agg.stacks.get(p.id);
  return {
    ...p,
    currentChips: s?.chips ?? 0,
    buyinChips: Number(t?.chips ?? 0),
    buyinCount: Number(t?.count ?? 0),
    lastUpdateAt: s ? new Date(s.recordedAt).toISOString() : null,
  };
}

export async function loadGameState(gameId: string): Promise<GameState> {
  const game = await getGame(gameId);
  if (game.status === "active" && !game.joinCode) game.joinCode = await assignJoinCode(game.id);
  const [hostRow] = await db.select().from(users).where(eq(users.id, game.hostUserId)).limit(1);
  const chatRow = game.chatId
    ? (await db.select().from(chats).where(eq(chats.id, game.chatId)).limit(1))[0]
    : undefined;
  const plist = await db.select().from(players).where(eq(players.gameId, gameId)).orderBy(asc(players.id));
  const agg = await playerAggregates([gameId]);
  const pviews = plist.map((p) => toPlayerView(p, agg));
  const blist = await db
    .select({ id: buyins.id, playerId: buyins.playerId, chips: buyins.chips, kind: buyins.kind, createdAt: buyins.createdAt })
    .from(buyins)
    .where(eq(buyins.gameId, gameId))
    .orderBy(asc(buyins.createdAt), asc(buyins.id));
  const snaps = await db
    .select({ playerId: stackSnapshots.playerId, chips: stackSnapshots.chips, recordedAt: stackSnapshots.recordedAt })
    .from(stackSnapshots)
    .where(eq(stackSnapshots.gameId, gameId))
    .orderBy(asc(stackSnapshots.recordedAt), asc(stackSnapshots.id));

  return {
    game,
    host: { id: game.hostUserId, name: hostRow ? displayNameOf(hostRow) : "Хост" },
    chat: chatRow ? { title: chatRow.title, publicId: chatRow.publicId } : null,
    players: pviews,
    buyins: blist,
    snapshots: snaps.map((s) => ({ playerId: s.playerId, chips: s.chips, t: new Date(s.recordedAt).getTime() })),
    results: computeResults(game, pviews),
    check: chipCheck(pviews.filter((p) => p.status !== "left" || p.currentChips > 0)),
  };
}

// ---------------------------------------------------------------- permissions

/** The group chat (and forum topic) that receives this game's notifications. */
export function gameTarget(game: Game): ChatTarget {
  return { chatId: game.chatId, topicId: game.topicId };
}

export function isHost(game: Game, userId: number | null | undefined) {
  return userId != null && game.hostUserId === userId;
}

function assertHost(game: Game, actor: User) {
  if (!isHost(game, actor.id)) throw forbidden("Це може зробити лише хост гри");
}

function assertActive(game: Game) {
  if (game.status !== "active") throw badRequest("Гру вже завершено");
}

function assertCanEditPlayer(game: Game, player: Player, actor: User) {
  if (isHost(game, actor.id)) return;
  if (player.userId != null && player.userId === actor.id) return;
  throw forbidden("Можна змінювати лише свій стек");
}

async function touchGame(gameId: string) {
  await db.update(games).set({ updatedAt: new Date() }).where(eq(games.id, gameId));
}

// ---------------------------------------------------------------- create / settings

export interface CreateGameInput {
  name?: string;
  type: "cash" | "tournament";
  startingStack: number;
  blindTemplate?: BlindTemplateId;
  blindStructure?: BlindLevel[];
  turnSeconds?: number;
  chatId?: number | null;
  hostPlays?: boolean;
  playerNames?: string[];
  /** Forum topic the game was created from (bot); otherwise the group's poker topic is used. */
  topicId?: number | null;
}

export async function createGame(actor: User, input: CreateGameInput): Promise<Game> {
  if (input.chatId != null) {
    const [m] = await db
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, input.chatId), eq(chatMembers.userId, actor.id)))
      .limit(1);
    if (!m) throw forbidden("Ви не учасник цієї групи");
  }
  const chatRow =
    input.chatId != null ? (await db.select().from(chats).where(eq(chats.id, input.chatId)).limit(1))[0] : undefined;
  const season =
    input.chatId != null
      ? (
          await db
            .select()
            .from(seasons)
            .where(and(eq(seasons.chatId, input.chatId), eq(seasons.isActive, true)))
            .orderBy(desc(seasons.startsAt))
            .limit(1)
        )[0]
      : undefined;

  const template = input.blindTemplate ?? (input.type === "cash" ? "cash" : "regular");
  const structure = input.blindStructure?.length ? input.blindStructure : buildStructure(template, input.startingStack);
  const date = new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  const [game] = await db
    .insert(games)
    .values({
      id: newGameId(),
      name: input.name?.trim() || `${input.type === "cash" ? "Кеш" : "Турнір"} ${date}`,
      chatId: input.chatId ?? null,
      seasonId: season?.id ?? null,
      hostUserId: actor.id,
      type: input.type,
      startingStack: input.startingStack,
      blindStructure: structure,
      turnSeconds: input.turnSeconds ?? 30,
      topicId: input.chatId != null ? (input.topicId ?? chatRow?.topicId ?? null) : null,
    })
    .returning();

  game.joinCode = await assignJoinCode(game.id);

  if (input.hostPlays !== false) {
    await insertPlayer(game, displayNameOf(actor), actor.id, actor.id);
  }
  for (const name of input.playerNames ?? []) {
    if (name.trim()) await insertPlayer(game, name.trim(), null, actor.id);
  }
  return game;
}

export interface UpdateGameInput {
  name?: string;
  turnSeconds?: number;
  blindStructure?: BlindLevel[];
  startingStack?: number;
}

export async function updateGame(gameId: string, actor: User, input: UpdateGameInput) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  const patch: Partial<Game> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 80) || game.name;
  if (input.startingStack !== undefined) patch.startingStack = input.startingStack;
  if (input.blindStructure !== undefined) {
    if (!input.blindStructure.length) throw badRequest("Структура блайндів порожня");
    patch.blindStructure = input.blindStructure;
    patch.blindLevel = Math.min(game.blindLevel, input.blindStructure.length - 1);
    patch.timerVersion = game.timerVersion + 1;
  }
  if (input.turnSeconds !== undefined) patch.turnSeconds = input.turnSeconds;
  const [updated] = await db.update(games).set(patch).where(eq(games.id, gameId)).returning();
  if (input.blindStructure !== undefined) await scheduleBlindJob(updated);
  return updated;
}

export async function deleteGame(gameId: string, actor: User) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  await db.delete(games).where(eq(games.id, gameId));
}

// ---------------------------------------------------------------- players

async function insertPlayer(game: Game, displayName: string, userId: number | null, actorId: number) {
  const [p] = await db
    .insert(players)
    .values({ gameId: game.id, displayName: displayName.slice(0, 40), userId })
    .returning();
  await db.insert(buyins).values({ gameId: game.id, playerId: p.id, chips: game.startingStack, kind: "buyin", createdBy: actorId });
  await db.insert(stackSnapshots).values({ gameId: game.id, playerId: p.id, chips: game.startingStack, recordedBy: actorId });
  return p;
}

export async function addPlayer(gameId: string, actor: User, displayName: string) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  assertActive(game);
  const name = displayName.trim();
  if (!name) throw badRequest("Вкажіть ім'я");
  const p = await insertPlayer(game, name, null, actor.id);
  await touchGame(gameId);
  return p;
}

/** The viewer joins the game: claims a free seat (playerId) or takes a new one. */
export async function joinGame(gameId: string, actor: User, playerId?: number) {
  const game = await getGame(gameId);
  assertActive(game);
  const [existing] = await db
    .select()
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.userId, actor.id)))
    .limit(1);
  if (existing) throw badRequest("Ви вже в цій грі");
  if (playerId != null) {
    const p = await getPlayer(gameId, playerId);
    if (p.userId != null) throw badRequest("Це місце вже зайняте");
    const [updated] = await db
      .update(players)
      .set({ userId: actor.id })
      .where(and(eq(players.id, playerId), isNull(players.userId)))
      .returning();
    if (!updated) throw badRequest("Це місце вже зайняте");
    await touchGame(gameId);
    return updated;
  }
  const p = await insertPlayer(game, displayNameOf(actor), actor.id, actor.id);
  await touchGame(gameId);
  return p;
}

export async function updatePlayer(
  gameId: string,
  playerId: number,
  actor: User,
  input: { displayName?: string; unlink?: boolean; status?: "active" | "left" },
) {
  const game = await getGame(gameId);
  const player = await getPlayer(gameId, playerId);
  const host = isHost(game, actor.id);
  const own = player.userId === actor.id;
  if (!host && !own) throw forbidden();
  const patch: Partial<Player> = {};
  if (input.displayName !== undefined) {
    const n = input.displayName.trim().slice(0, 40);
    if (!n) throw badRequest("Вкажіть ім'я");
    patch.displayName = n;
  }
  if (input.unlink) patch.userId = null;
  if (input.status) patch.status = input.status;
  if (Object.keys(patch).length) await db.update(players).set(patch).where(eq(players.id, playerId));
  await touchGame(gameId);
}

export async function removePlayer(gameId: string, playerId: number, actor: User) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  await getPlayer(gameId, playerId);
  await db.delete(players).where(eq(players.id, playerId));
  await touchGame(gameId);
}

// ---------------------------------------------------------------- buy-ins
// Stacks are not tracked during play: a player's chips are what they bought in,
// and the host records the final stacks once, when the game ends.

export async function addBuyin(gameId: string, playerId: number, actor: User, kind: BuyinKind, chips?: number) {
  const game = await getGame(gameId);
  assertActive(game);
  const player = await getPlayer(gameId, playerId);
  assertCanEditPlayer(game, player, actor);
  const amount = chips ?? game.startingStack;
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest("Сума бай-іну має бути додатною");
  const agg = await playerAggregates([gameId]);
  const current = agg.stacks.get(playerId)?.chips ?? 0;
  await db.insert(buyins).values({ gameId, playerId, chips: amount, kind, createdBy: actor.id });
  await db.insert(stackSnapshots).values({ gameId, playerId, chips: current + amount, recordedBy: actor.id });
  if (player.status !== "active") {
    // A rebuy brings a busted tournament player back in; their place is recalculated later.
    await db.update(players).set({ status: "active", finishPlace: null, bustedAt: null }).where(eq(players.id, playerId));
  }
  await touchGame(gameId);
  return { stack: current + amount };
}

export async function deleteBuyin(gameId: string, buyinId: number, actor: User) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  assertActive(game);
  const [b] = await db
    .select()
    .from(buyins)
    .where(and(eq(buyins.id, buyinId), eq(buyins.gameId, gameId)))
    .limit(1);
  if (!b) throw notFound("Бай-ін не знайдено");
  const agg = await playerAggregates([gameId]);
  const current = agg.stacks.get(b.playerId)?.chips ?? 0;
  await db.delete(buyins).where(eq(buyins.id, buyinId));
  await db
    .insert(stackSnapshots)
    .values({ gameId, playerId: b.playerId, chips: Math.max(0, current - b.chips), recordedBy: actor.id });
  await touchGame(gameId);
}

/** Tournament elimination: stack goes to 0 and the player gets the next free place from the bottom. */
export async function bustPlayer(gameId: string, playerId: number, actor: User) {
  const game = await getGame(gameId);
  assertActive(game);
  const player = await getPlayer(gameId, playerId);
  assertCanEditPlayer(game, player, actor);
  if (game.type !== "tournament") throw badRequest("У кеш-грі гравці не вибувають — фінальний стек вводиться в кінці гри");
  if (player.status !== "active") throw badRequest("Гравець уже вибув");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.status, "active")));
  const place = bustPlace(Number(count));
  await db
    .update(players)
    .set({ status: "busted", finishPlace: place, bustedAt: new Date() })
    .where(eq(players.id, playerId));
  await db.insert(stackSnapshots).values({ gameId, playerId, chips: 0, recordedBy: actor.id });
  await touchGame(gameId);
  if (game.chatId) {
    const left = Number(count) - 1;
    await notifyChat(
      gameTarget(game),
      `💥 <b>${escapeHtml(player.displayName)}</b> вибуває — ${place}-е місце.` +
        (left === 1 ? "\n🏆 Залишився один гравець — хост може завершити турнір." : ` У грі ще ${left}.`),
    );
  }
  return { place };
}

export async function unbustPlayer(gameId: string, playerId: number, actor: User) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  assertActive(game);
  await getPlayer(gameId, playerId);
  await db.update(players).set({ status: "active", finishPlace: null, bustedAt: null }).where(eq(players.id, playerId));
  await touchGame(gameId);
}

// ---------------------------------------------------------------- blinds timer

export async function timerAction(gameId: string, actor: User, action: TimerAction) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  assertActive(game);
  const now = new Date();
  const next = applyTimerAction(game.blindStructure, game, action, now);
  const [updated] = await db
    .update(games)
    .set({ ...next, timerVersion: game.timerVersion + 1, updatedAt: now })
    .where(eq(games.id, gameId))
    .returning();
  await scheduleBlindJob(updated);
  if ((action === "next" || action === "prev") && updated.chatId) {
    const v = computeTimer(updated.blindStructure, updated, now);
    if (v.status === "running") await notifyChat(gameTarget(updated), levelMessage(updated, v.levelIndex));
  }
  return updated;
}

export function levelMessage(game: Game, levelIndex: number) {
  const level = game.blindStructure[levelIndex];
  if (!level) return "";
  const head = level.isBreak ? "☕ <b>Перерва</b>" : `⏫ <b>Рівень ${playingLevelNumber(game.blindStructure, levelIndex)}</b>: ${formatBlinds(level)}`;
  const mins = level.minutes ? ` · ${level.minutes} хв` : "";
  return `${head}${mins}\n<i>${escapeHtml(game.name)}</i>`;
}

/** Level number as players see it (breaks are not counted). */
export function playingLevelNumber(structure: BlindLevel[], idx: number) {
  return structure.slice(0, idx + 1).filter((l) => !l.isBreak).length;
}

/** Schedules a QStash job for the moment the current level ends (group notification). */
export async function scheduleBlindJob(game: Game) {
  if (!game.chatId || game.status !== "active") return;
  const v = computeTimer(game.blindStructure, game, new Date());
  if (v.status !== "running" || !v.levelEndsAt) return;
  await scheduleJob(
    "/api/jobs/blind-level",
    { gameId: game.id, version: game.timerVersion, level: v.levelIndex + 1 },
    v.levelEndsAt,
  );
}

export async function handleBlindJob(body: { gameId: string; version: number; level: number }) {
  const [game] = await db.select().from(games).where(eq(games.id, body.gameId)).limit(1);
  if (!game || game.status !== "active" || game.timerVersion !== body.version) return "stale";
  const v = computeTimer(game.blindStructure, game, new Date());
  if (v.status !== "running") return "not-running";
  if (v.levelIndex >= body.level) {
    await notifyChat(gameTarget(game), levelMessage(game, v.levelIndex), urlButton("⏱ Таймер", miniAppLink(game.id)));
  }
  await scheduleBlindJob(game);
  return "ok";
}

// ---------------------------------------------------------------- end game

export async function endGame(gameId: string, actor: User, finalStacks?: Record<string, number>) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  assertActive(game);
  const state = await loadGameState(gameId);
  for (const p of state.players) {
    const raw = finalStacks?.[String(p.id)];
    const chips = raw != null && Number.isInteger(raw) && raw >= 0 ? raw : p.currentChips;
    if (chips !== p.currentChips) {
      await db.insert(stackSnapshots).values({ gameId, playerId: p.id, chips, recordedBy: actor.id });
    }
    await db.update(players).set({ finalChips: chips }).where(eq(players.id, p.id));
  }
  if (game.type === "tournament") {
    // Freeze places for everyone still in, ranked by chips.
    const fresh = await loadGameState(gameId);
    for (const r of fresh.results) {
      await db.update(players).set({ finishPlace: r.place }).where(eq(players.id, r.playerId));
    }
  }
  await db
    .update(games)
    .set({
      status: "finished",
      finishedAt: new Date(),
      updatedAt: new Date(),
      levelStartedAt: null,
      pausedRemainingMs: null,
      timerVersion: game.timerVersion + 1,
    })
    .where(eq(games.id, gameId));
  const final = await loadGameState(gameId);
  return final;
}

export async function reopenGame(gameId: string, actor: User) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  if (game.status !== "finished") throw badRequest("Гра ще триває");
  await db
    .update(games)
    .set({ status: "active", finishedAt: null, joinCode: null, updatedAt: new Date() })
    .where(eq(games.id, gameId));
  await assignJoinCode(gameId);
  await db.update(players).set({ finalChips: null }).where(eq(players.gameId, gameId));
  if (game.type === "tournament") {
    await db
      .update(players)
      .set({ finishPlace: null })
      .where(and(eq(players.gameId, gameId), eq(players.status, "active")));
  }
}

// ---------------------------------------------------------------- text summaries (bot)

export function standingsText(state: GameState): string {
  const { game } = state;
  const lines =
    game.type === "tournament"
      ? state.results.map((r) => {
          const p = state.players.find((x) => x.id === r.playerId)!;
          const name = escapeHtml(r.displayName);
          const rebuys = r.buyinCount > 1 ? ` · ${r.buyinCount} БІ` : "";
          return p.status === "busted" ? `  ${r.place}. <s>${name}</s>${rebuys}` : `  • ${name} — у грі${rebuys}`;
        })
      : [...state.players]
          .sort((a, b) => b.buyinChips - a.buyinChips || a.displayName.localeCompare(b.displayName))
          .map((p) => `  • ${escapeHtml(p.displayName)} — ${fmtChips(p.buyinChips)} (${p.buyinCount} БІ)`);
  const total = state.players.reduce((s, p) => s + p.buyinChips, 0);
  const foot = state.players.length ? `\n\nУ грі куплено ${fmtChips(total)} фішок.` : "";
  return (lines.join("\n") || "  поки нікого") + foot;
}

export function summaryText(state: GameState): string {
  const { game } = state;
  const medals = ["🥇", "🥈", "🥉"];
  const lines = state.results.map((r) => {
    const m = medals[r.place - 1] ?? `${r.place}.`;
    const name = escapeHtml(r.displayName);
    if (game.type === "tournament") return `${m} ${name} — ${r.points} очк.`;
    return `${m} ${name}: ${fmtSigned(r.netChips)} (${fmtBuyins(r.netBuyins)})`;
  });
  const totalBuyins = state.players.reduce((s, p) => s + p.buyinCount, 0);
  return (
    `🏁 <b>${escapeHtml(game.name)}</b> завершено\n` +
    `${game.type === "cash" ? "Кеш" : "Турнір"} · ${state.players.length} гравців · ${totalBuyins} бай-інів\n\n` +
    lines.join("\n")
  );
}

export function gameCsv(state: GameState): string {
  const { game } = state;
  const header = [
    "Місце",
    "Гравець",
    "Telegram ID",
    "Бай-інів",
    "Бай-іни (фішки)",
    "Фінальний стек",
    "Результат (фішки)",
    "Результат (бай-іни)",
    "Очки",
  ];
  const rows = state.results.map((r) => [
    r.place,
    r.displayName,
    r.userId ?? "",
    r.buyinCount,
    r.buyinChips,
    r.finalChips,
    r.netChips,
    r.netBuyins,
    r.points ?? "",
  ]);
  const meta = [
    ["Гра", game.name],
    ["Тип", game.type === "cash" ? "Кеш" : "Турнір"],
    ["Стартовий стек", game.startingStack],
    ["Створено", game.createdAt.toISOString()],
    ["Завершено", game.finishedAt?.toISOString() ?? ""],
    [],
  ];
  return "﻿" + [...meta, header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function csvCell(v: unknown): string {
  let s = String(v ?? "");
  // Neutralize spreadsheet formula injection in user-entered names.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------------------------------------------------------------- lists

export interface GameListItem {
  id: string;
  name: string;
  type: "cash" | "tournament";
  status: "active" | "finished";
  createdAt: Date;
  finishedAt: Date | null;
  playerCount: number;
  isHost: boolean;
  chatTitle: string | null;
  winner: string | null;
}

/** Games the user hosts, plays in, or that belong to their groups. */
export async function listGamesForUser(userId: number, opts: { status?: "active" | "finished"; limit?: number } = {}) {
  const memberChats = db.select({ id: chatMembers.chatId }).from(chatMembers).where(eq(chatMembers.userId, userId));
  const playedGames = db.select({ id: players.gameId }).from(players).where(eq(players.userId, userId));
  const rows = await db
    .select({ game: games, chatTitle: chats.title })
    .from(games)
    .leftJoin(chats, eq(chats.id, games.chatId))
    .where(
      and(
        or(eq(games.hostUserId, userId), inArray(games.id, playedGames), inArray(games.chatId, memberChats)),
        opts.status ? eq(games.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(games.createdAt))
    .limit(opts.limit ?? 50);
  return decorateGames(rows, userId);
}

export async function listGamesForChat(chatId: number, opts: { status?: "active" | "finished"; limit?: number } = {}) {
  const rows = await db
    .select({ game: games, chatTitle: chats.title })
    .from(games)
    .leftJoin(chats, eq(chats.id, games.chatId))
    .where(and(eq(games.chatId, chatId), opts.status ? eq(games.status, opts.status) : undefined))
    .orderBy(desc(games.createdAt))
    .limit(opts.limit ?? 20);
  return decorateGames(rows, null);
}

async function decorateGames(rows: { game: Game; chatTitle: string | null }[], userId: number | null) {
  const ids = rows.map((r) => r.game.id);
  const plist = ids.length ? await db.select().from(players).where(inArray(players.gameId, ids)) : [];
  const finishedIds = rows.filter((r) => r.game.status === "finished").map((r) => r.game.id);
  const agg = await playerAggregates(finishedIds);
  return rows.map(({ game, chatTitle }): GameListItem => {
    const gp = plist.filter((p) => p.gameId === game.id);
    let winner: string | null = null;
    if (game.status === "finished" && gp.length) {
      const res = computeResults(game, gp.map((p) => toPlayerView(p, agg)));
      winner = res[0]?.displayName ?? null;
    }
    return {
      id: game.id,
      name: game.name,
      type: game.type,
      status: game.status,
      createdAt: game.createdAt,
      finishedAt: game.finishedAt,
      playerCount: gp.length,
      isHost: userId != null && game.hostUserId === userId,
      chatTitle,
      winner,
    };
  });
}

/** Latest active game of a group chat (used by bot commands). */
export async function activeGameInChat(chatId: number): Promise<Game | null> {
  const [g] = await db
    .select()
    .from(games)
    .where(and(eq(games.chatId, chatId), eq(games.status, "active")))
    .orderBy(desc(games.createdAt))
    .limit(1);
  return g ?? null;
}

export async function playerForUser(gameId: string, userId: number): Promise<Player | null> {
  const [p] = await db
    .select()
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.userId, userId)))
    .limit(1);
  return p ?? null;
}

export { playerAggregates, toPlayerView };
