import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, type DbOrTx, type Tx } from "@/lib/db";
import {
  buyins,
  chatMembers,
  chats,
  games,
  joinAttempts,
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
import {
  MAX_SEATS,
  MIN_SEATS,
  moveButton as moveButtonOn,
  randomSeating,
  reconcileSeating,
  type SeatMove,
  type SeatingState,
} from "@/lib/game/seating";
import { fmtBuyins, fmtChips, fmtSigned } from "@/lib/format";
import { miniAppLink } from "@/lib/config";
import { scheduleJob } from "@/lib/qstash";
import { escapeHtml, notifyChat, urlButton } from "@/lib/telegram/api";
import { localeOf, translate, type Lang } from "@/lib/i18n";
import { AppError, badRequest, forbidden, notFound } from "./errors";
import { displayNameOf, langOfUser } from "./users";

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
  /** Active game nobody touched for a day: its join code is released. */
  idle: boolean;
}

export const newGameId = () => nanoid(10);

// ---------------------------------------------------------------- join codes

export const JOIN_CODE_RE = /^\d{4}$/;

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/** An active game nobody has touched for this long is "idle": its join code goes back to the pool. */
export const IDLE_MS = 24 * 60 * 60 * 1000;

export function isIdle(game: Pick<Game, "status" | "updatedAt">, now = Date.now()) {
  return game.status === "active" && now - game.updatedAt.getTime() > IDLE_MS;
}

/**
 * Gives an active game without a code a fresh 4-digit code (1000–9999) not used by any other active
 * game, and returns the game's code. Safe under concurrency: the code is only written while the game
 * has none (conditional UPDATE), so parallel callers all end up with the same code. Bumps `version`
 * so clients holding an ETag see the new code. Returns null if the game is no longer active.
 */
export async function assignJoinCode(gameId: string): Promise<string | null> {
  // Codes of abandoned games are released first, so the pool never fills up with forgotten games.
  await db
    .update(games)
    .set({ joinCode: null })
    .where(
      and(
        eq(games.status, "active"),
        isNotNull(games.joinCode),
        lt(games.updatedAt, new Date(Date.now() - IDLE_MS)),
      ),
    );
  for (let attempt = 0; attempt < 6; attempt++) {
    const rows = await db
      .select({ code: games.joinCode })
      .from(games)
      .where(and(eq(games.status, "active"), isNotNull(games.joinCode)));
    const used = new Set(rows.map((r) => r.code));
    if (used.size >= 8000) throw new AppError(503, "errors.tooManyGames");
    let code: string;
    do code = String(randomInt(1000, 10000));
    while (used.has(code));
    try {
      const [set] = await db
        .update(games)
        .set({ joinCode: code, version: sql`${games.version} + 1` })
        .where(and(eq(games.id, gameId), isNull(games.joinCode), eq(games.status, "active")))
        .returning({ code: games.joinCode });
      if (set) return set.code;
      // Someone else assigned a code first (or the game ended): use what is there now.
      const [cur] = await db.select({ code: games.joinCode }).from(games).where(eq(games.id, gameId)).limit(1);
      return cur?.code ?? null;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new AppError(503, "errors.codeGenFailed");
}

export async function findActiveGameByCode(code: string, q: DbOrTx = db): Promise<Game> {
  const c = code.trim();
  if (!JOIN_CODE_RE.test(c)) throw badRequest("errors.codeFormat");
  const [g] = await q
    .select()
    .from(games)
    .where(
      and(eq(games.joinCode, c), eq(games.status, "active"), gt(games.updatedAt, new Date(Date.now() - IDLE_MS))),
    )
    .limit(1);
  if (!g) throw notFound("errors.codeNotFound");
  return g;
}

/** Brute-force protection for 4-digit codes: at most this many wrong codes per user per window. */
export const JOIN_MAX_FAILS = 10;
export const JOIN_WINDOW_MS = 10 * 60 * 1000;

/**
 * `findActiveGameByCode` with a per-user limit on failed attempts (HTTP 429 when exceeded).
 * Count, lookup and the failure record run in one transaction under a per-user advisory lock, so a
 * burst of parallel guesses is serialized and cannot slip past the limit.
 */
export async function findGameByCodeLimited(userId: number, code: string): Promise<Game> {
  const c = code.trim();
  if (!JOIN_CODE_RE.test(c)) throw badRequest("errors.codeFormat");
  const outcome = await db.transaction(async (tx): Promise<{ game: Game } | { error: AppError }> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('join_attempts'), hashtext(${String(userId)}))`);
    const [{ fails }] = await tx
      .select({ fails: sql<number>`count(*)`.mapWith(Number) })
      .from(joinAttempts)
      .where(and(eq(joinAttempts.userId, userId), gt(joinAttempts.createdAt, new Date(Date.now() - JOIN_WINDOW_MS))));
    if (fails >= JOIN_MAX_FAILS) return { error: new AppError(429, "errors.tooManyAttempts") };
    try {
      return { game: await findActiveGameByCode(c, tx) };
    } catch (e) {
      if (!(e instanceof AppError && e.status === 404)) throw e;
      // Recorded and committed before the 404 goes out.
      await tx.insert(joinAttempts).values({ userId });
      return { error: e };
    }
  });
  if ("game" in outcome) return outcome.game;
  if (outcome.error.status === 404 && Math.random() < 0.05) {
    await db.delete(joinAttempts).where(lt(joinAttempts.createdAt, new Date(Date.now() - 24 * 3600_000)));
  }
  throw outcome.error;
}

/**
 * Join by code. Seats the user right away unless the host pre-added players without Telegram —
 * then the client lets them pick their seat first.
 */
export async function joinByCode(actor: User, code: string) {
  const game = await findGameByCodeLimited(actor.id, code);
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

export async function getGame(gameId: string, q: DbOrTx = db): Promise<Game> {
  const [g] = await q.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!g) throw notFound("errors.gameNotFound");
  return g;
}

async function getPlayer(q: DbOrTx, gameId: string, playerId: number): Promise<Player> {
  const [p] = await q
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.gameId, gameId)))
    .limit(1);
  if (!p) throw notFound("errors.playerNotFound");
  return p;
}

/**
 * Runs independent reads: concurrently on the pool (`db`), one after another on a transaction —
 * a transaction is a single connection, and pg must not get a query while one is running.
 */
async function readAll<T extends unknown[]>(q: DbOrTx, ...tasks: { [K in keyof T]: () => PromiseLike<T[K]> }): Promise<T> {
  if (q === db) return (await Promise.all(tasks.map((t) => t()))) as T;
  const out: unknown[] = [];
  for (const t of tasks) out.push(await t());
  return out as T;
}

/** Totals and current stacks for the players of several games at once. */
async function playerAggregates(gameIds: string[], q: DbOrTx = db) {
  if (!gameIds.length) return { totals: new Map(), stacks: new Map() };
  const totalsQuery = () =>
    q
      .select({
        playerId: buyins.playerId,
        // bigint: sums of int columns can exceed 2^31.
        chips: sql<number>`coalesce(sum(${buyins.chips}), 0)::bigint`.mapWith(Number),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(buyins)
      .where(inArray(buyins.gameId, gameIds))
      .groupBy(buyins.playerId);
  const stackQuery = () =>
    q
      .selectDistinctOn([stackSnapshots.playerId], {
        playerId: stackSnapshots.playerId,
        chips: stackSnapshots.chips,
        recordedAt: stackSnapshots.recordedAt,
      })
      .from(stackSnapshots)
      .where(inArray(stackSnapshots.gameId, gameIds))
      // Latest by insertion order: ids are allocated under the game lock, timestamps may tie.
      .orderBy(stackSnapshots.playerId, desc(stackSnapshots.id));
  const [totalsRows, stackRows] = await readAll(q, totalsQuery, stackQuery);
  return {
    totals: new Map<number, { chips: number; count: number }>(totalsRows.map((r) => [r.playerId, r])),
    stacks: new Map<number, { chips: number; recordedAt: Date }>(stackRows.map((r) => [r.playerId, r])),
  };
}

async function currentStack(q: DbOrTx, playerId: number): Promise<number> {
  const [s] = await q
    .select({ chips: stackSnapshots.chips })
    .from(stackSnapshots)
    .where(eq(stackSnapshots.playerId, playerId))
    .orderBy(desc(stackSnapshots.id))
    .limit(1);
  return s?.chips ?? 0;
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

/** Full game state. Outside transactions it also (re)assigns a join code to active games without one. */
export async function loadGameState(gameId: string, q: DbOrTx = db): Promise<GameState> {
  let game = await getGame(gameId, q);
  const idle = isIdle(game);
  if (q === db && game.status === "active" && !game.joinCode && !idle) {
    await assignJoinCode(game.id);
    // Re-read: the code (and the version it bumped) may come from a concurrent request.
    game = await getGame(gameId, q);
  }
  // Independent reads run concurrently on the pool, sequentially inside a transaction.
  const [[hostRow], chatRows, plist, agg, blist, snaps] = await readAll(
    q,
    () => q.select().from(users).where(eq(users.id, game.hostUserId)).limit(1),
    () => (game.chatId ? q.select().from(chats).where(eq(chats.id, game.chatId)).limit(1) : Promise.resolve([])),
    () => q.select().from(players).where(eq(players.gameId, gameId)).orderBy(asc(players.id)),
    () => playerAggregates([gameId], q),
    () =>
      q
        .select({ id: buyins.id, playerId: buyins.playerId, chips: buyins.chips, kind: buyins.kind, createdAt: buyins.createdAt })
        .from(buyins)
        .where(eq(buyins.gameId, gameId))
        .orderBy(asc(buyins.createdAt), asc(buyins.id)),
    () =>
      q
        .select({ playerId: stackSnapshots.playerId, chips: stackSnapshots.chips, recordedAt: stackSnapshots.recordedAt })
        .from(stackSnapshots)
        .where(eq(stackSnapshots.gameId, gameId))
        .orderBy(asc(stackSnapshots.id)),
  );
  const chatRow = chatRows[0];
  const pviews = plist.map((p) => toPlayerView(p, agg));

  return {
    game,
    host: { id: game.hostUserId, name: hostRow ? displayNameOf(hostRow) : translate("uk", "msg.defaultHost") },
    chat: chatRow ? { title: chatRow.title, publicId: chatRow.publicId } : null,
    players: pviews,
    buyins: blist,
    snapshots: snaps.map((s) => ({ playerId: s.playerId, chips: s.chips, t: new Date(s.recordedAt).getTime() })),
    results: computeResults(game, pviews),
    check: chipCheck(pviews.filter((p) => p.status !== "left" || p.currentChips > 0)),
    idle,
  };
}

/** Cheap change probe for ETags and the live stream: one indexed row, no joins. */
export async function gameVersion(gameId: string) {
  const [g] = await db
    .select({ version: games.version, status: games.status, updatedAt: games.updatedAt })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  return g ? { version: g.version, status: g.status, idle: isIdle(g) } : null;
}

/** Weak ETag of a game as seen by one viewer (role and redaction depend on who is asking). */
export function gameEtag(v: { version: number; idle: boolean }, viewerId: number | null | undefined) {
  return `W/"g${v.version}-u${viewerId ?? 0}${v.idle ? "-i" : ""}"`;
}

// ---------------------------------------------------------------- permissions

export function isHost(game: Game, userId: number | null | undefined) {
  return userId != null && game.hostUserId === userId;
}

function assertHost(game: Game, actor: User) {
  if (!isHost(game, actor.id)) throw forbidden("errors.hostOnly");
}

function assertActive(game: Game) {
  if (game.status !== "active") throw badRequest("errors.gameFinished");
}

function assertCanEditPlayer(game: Game, player: Player, actor: User) {
  if (isHost(game, actor.id)) return;
  if (player.userId != null && player.userId === actor.id) return;
  throw forbidden("errors.ownStackOnly");
}

// ---------------------------------------------------------------- mutation helper

type Effect = () => Promise<unknown>;

interface Mutation {
  tx: Tx;
  /** The game row, locked FOR UPDATE until the transaction ends. */
  game: Game;
  /** Runs `fn` after a successful commit (Telegram messages, QStash jobs). */
  after(fn: Effect): void;
}

/**
 * Runs a game mutation in a transaction holding a row lock on the game, so concurrent actions on the
 * same game are serialized (no duplicate places, no lost stack updates). Bumps `version`/`updatedAt`.
 */
async function mutateGame<T>(gameId: string, fn: (m: Mutation) => Promise<T>): Promise<T> {
  const effects: Effect[] = [];
  const result = await db.transaction(async (tx) => {
    const [game] = await tx.select().from(games).where(eq(games.id, gameId)).for("update");
    if (!game) throw notFound("errors.gameNotFound");
    const out = await fn({ tx, game, after: (e) => effects.push(e) });
    const seatMoves = await reconcileGameSeating(tx, gameId);
    if (seatMoves?.lines.length && seatMoves.chatId) {
      const { chatId, lines } = seatMoves;
      effects.push(async () => {
        const lang = await langOfUser(game.hostUserId);
        const text = [translate(lang, "msg.seatingMoves"), ...lines.map((l) => seatLine(lang, l.name, l.move))].join("\n");
        await notifyChat(chatId, text);
      });
    }
    await tx
      .update(games)
      .set({ updatedAt: new Date(), version: sql`${games.version} + 1` })
      .where(eq(games.id, gameId));
    return out;
  });
  for (const e of effects) {
    try {
      await e();
    } catch (err) {
      console.error("[games] after-commit effect failed", err);
    }
  }
  return result;
}

// ---------------------------------------------------------------- create / settings

export interface CreateGameInput {
  name?: string;
  type: "cash" | "tournament";
  startingStack: number;
  blindTemplate?: BlindTemplateId;
  blindStructure?: BlindLevel[];
  reminderIntervalMin?: number | null;
  chatId?: number | null;
  hostPlays?: boolean;
  playerNames?: string[];
}

export async function createGame(actor: User, input: CreateGameInput): Promise<Game> {
  if (input.chatId != null) {
    const [m] = await db
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, input.chatId), eq(chatMembers.userId, actor.id)))
      .limit(1);
    if (!m) throw forbidden("errors.notGroupMember");
  }
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
  const lang = await langOfUser(actor.id);
  const date = new Date().toLocaleDateString(localeOf(lang), { day: "numeric", month: "short", timeZone: "Europe/Kyiv" });
  const game = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(games)
      .values({
        id: newGameId(),
        name:
          input.name?.trim() ||
          translate(lang, "msg.defaultName", { type: translate(lang, input.type === "cash" ? "common.cash" : "common.tournament"), date }),
        chatId: input.chatId ?? null,
        seasonId: season?.id ?? null,
        hostUserId: actor.id,
        type: input.type,
        startingStack: input.startingStack,
        blindStructure: structure,
        reminderIntervalMin: input.reminderIntervalMin || null,
      })
      .returning();
    const names = (input.playerNames ?? []).map((n) => n.trim()).filter(Boolean);
    const seats: { name: string; userId: number | null }[] = [
      ...(input.hostPlays !== false ? [{ name: displayNameOf(actor), userId: actor.id }] : []),
      ...names.map((name) => ({ name, userId: null })),
    ];
    await insertPlayers(tx, g, seats, actor.id);
    return g;
  });

  await assignJoinCode(game.id);
  const created = await getGame(game.id);
  if (created.reminderIntervalMin && created.chatId) await scheduleReminder(created);
  return created;
}

export interface UpdateGameInput {
  name?: string;
  reminderIntervalMin?: number | null;
  blindStructure?: BlindLevel[];
  startingStack?: number;
}

export async function updateGame(gameId: string, actor: User, input: UpdateGameInput) {
  return mutateGame(gameId, async ({ tx, game, after }) => {
    assertHost(game, actor);
    const patch: Partial<Game> = {};
    if (input.name !== undefined) patch.name = input.name.trim().slice(0, 80) || game.name;
    if (input.startingStack !== undefined) patch.startingStack = input.startingStack;
    if (input.blindStructure !== undefined) {
      if (!input.blindStructure.length) throw badRequest("errors.emptyStructure");
      patch.blindStructure = input.blindStructure;
      patch.blindLevel = Math.min(game.blindLevel, input.blindStructure.length - 1);
      patch.timerVersion = game.timerVersion + 1;
    }
    let reminderChanged = false;
    if (input.reminderIntervalMin !== undefined) {
      patch.reminderIntervalMin = input.reminderIntervalMin || null;
      patch.reminderVersion = game.reminderVersion + 1;
      reminderChanged = true;
    }
    const updated = Object.keys(patch).length
      ? (await tx.update(games).set(patch).where(eq(games.id, gameId)).returning())[0]
      : game;
    after(async () => {
      if (reminderChanged && updated.status === "active") await scheduleReminder(updated);
      if (input.blindStructure !== undefined) await scheduleBlindJob(updated);
    });
    return updated;
  });
}

export async function deleteGame(gameId: string, actor: User) {
  const game = await getGame(gameId);
  assertHost(game, actor);
  await db.delete(games).where(eq(games.id, gameId));
}

// ---------------------------------------------------------------- players

/** Seats players with the starting stack (one buy-in + one stack snapshot each). */
async function insertPlayers(
  q: DbOrTx,
  game: Game,
  seats: { name: string; userId: number | null }[],
  actorId: number,
): Promise<Player[]> {
  if (!seats.length) return [];
  const rows = await q
    .insert(players)
    .values(seats.map((s) => ({ gameId: game.id, displayName: s.name.slice(0, 40), userId: s.userId })))
    .returning();
  await q
    .insert(buyins)
    .values(rows.map((p) => ({ gameId: game.id, playerId: p.id, chips: game.startingStack, kind: "buyin" as const, createdBy: actorId })));
  await q
    .insert(stackSnapshots)
    .values(rows.map((p) => ({ gameId: game.id, playerId: p.id, chips: game.startingStack, recordedBy: actorId })));
  return rows;
}

export async function addPlayer(gameId: string, actor: User, displayName: string) {
  return mutateGame(gameId, async ({ tx, game }) => {
    assertHost(game, actor);
    assertActive(game);
    const name = displayName.trim();
    if (!name) throw badRequest("errors.nameRequired");
    const [p] = await insertPlayers(tx, game, [{ name, userId: null }], actor.id);
    return p;
  });
}

/** The viewer joins the game: claims a free seat (playerId) or takes a new one. */
export async function joinGame(gameId: string, actor: User, playerId?: number) {
  return mutateGame(gameId, async ({ tx, game }) => {
    assertActive(game);
    const [existing] = await tx
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.gameId, gameId), eq(players.userId, actor.id)))
      .limit(1);
    if (existing) throw badRequest("errors.alreadyInGame");
    if (playerId != null) {
      const p = await getPlayer(tx, gameId, playerId);
      if (p.userId != null) throw badRequest("errors.seatTaken");
      const [updated] = await tx.update(players).set({ userId: actor.id }).where(eq(players.id, playerId)).returning();
      return updated;
    }
    const [p] = await insertPlayers(tx, game, [{ name: displayNameOf(actor), userId: actor.id }], actor.id);
    return p;
  });
}

export async function updatePlayer(
  gameId: string,
  playerId: number,
  actor: User,
  input: { displayName?: string; unlink?: boolean; status?: "active" | "left" },
) {
  await mutateGame(gameId, async ({ tx, game }) => {
    const player = await getPlayer(tx, gameId, playerId);
    const host = isHost(game, actor.id);
    const own = player.userId != null && player.userId === actor.id;
    if (!host && !own) throw forbidden();
    const patch: Partial<Player> = {};
    if (input.displayName !== undefined) {
      const n = input.displayName.trim().slice(0, 40);
      if (!n) throw badRequest("errors.nameRequired");
      patch.displayName = n;
    }
    if (input.unlink) patch.userId = null;
    if (input.status && input.status !== player.status) {
      // Status decides places and points, so only the host may change it (players use bust/rebuy).
      if (!host) throw forbidden("errors.statusHostOnly");
      assertActive(game);
      patch.status = input.status;
      if (input.status === "active") Object.assign(patch, { finishPlace: null, bustedAt: null });
    }
    if (Object.keys(patch).length) await tx.update(players).set(patch).where(eq(players.id, playerId));
    if (patch.status === "active") await releaseSeatIfTaken(tx, gameId, playerId);
  });
}

export async function removePlayer(gameId: string, playerId: number, actor: User) {
  await mutateGame(gameId, async ({ tx, game }) => {
    assertHost(game, actor);
    await getPlayer(tx, gameId, playerId);
    await tx.delete(players).where(eq(players.id, playerId));
  });
}

/**
 * A player coming back into play (rebuy, un-bust, status → active) gives up their old seat if another
 * active player sits there now: reconciliation then seats them like a newcomer instead of evicting
 * the player who took the seat.
 */
async function releaseSeatIfTaken(tx: Tx, gameId: string, playerId: number) {
  await tx.execute(sql`
    update players p set table_no = null, seat_no = null
    where p.id = ${playerId} and p.game_id = ${gameId} and p.table_no is not null and exists (
      select 1 from players o
      where o.game_id = p.game_id and o.id <> p.id and o.status = 'active'
        and o.table_no = p.table_no and o.seat_no = p.seat_no
    )`);
}

// ---------------------------------------------------------------- stacks & buy-ins

/** Chip amounts are stored as int4: caps keep every stored value (and stack sums) far from 2^31. */
export const MAX_CHIPS = 1_000_000_000;
/** Total buy-in chips of one player in one game. */
export const MAX_BUYIN_TOTAL = 1_000_000_000;
/** A stack after a buy-in: at most a set stack plus all buy-ins. */
const MAX_STACK = MAX_CHIPS + MAX_BUYIN_TOTAL;

export async function setStack(gameId: string, playerId: number, actor: User, chips: number) {
  await mutateGame(gameId, async ({ tx, game }) => {
    assertActive(game);
    const player = await getPlayer(tx, gameId, playerId);
    assertCanEditPlayer(game, player, actor);
    if (!Number.isInteger(chips) || chips < 0 || chips > MAX_CHIPS) throw badRequest("errors.stackInvalid");
    await tx.insert(stackSnapshots).values({ gameId, playerId, chips, recordedBy: actor.id });
    if (player.status === "busted" && chips > 0 && game.type === "cash") {
      await tx.update(players).set({ status: "active" }).where(eq(players.id, playerId));
      await releaseSeatIfTaken(tx, gameId, playerId);
    }
  });
}

export async function addBuyin(gameId: string, playerId: number, actor: User, kind: BuyinKind, chips?: number) {
  return mutateGame(gameId, async ({ tx, game }) => {
    assertActive(game);
    const player = await getPlayer(tx, gameId, playerId);
    assertCanEditPlayer(game, player, actor);
    const amount = chips ?? game.startingStack;
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_BUYIN_TOTAL) throw badRequest("errors.buyinInvalid");
    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(${buyins.chips}), 0)::bigint`.mapWith(Number) })
      .from(buyins)
      .where(eq(buyins.playerId, playerId));
    if (total + amount > MAX_BUYIN_TOTAL) throw badRequest("errors.buyinInvalid");
    const stack = (await currentStack(tx, playerId)) + amount;
    if (stack > MAX_STACK) throw badRequest("errors.buyinInvalid");
    await tx.insert(buyins).values({ gameId, playerId, chips: amount, kind, createdBy: actor.id });
    await tx.insert(stackSnapshots).values({ gameId, playerId, chips: stack, recordedBy: actor.id });
    if (player.status !== "active") {
      // A rebuy brings a busted tournament player back in; their place is recalculated later.
      await tx.update(players).set({ status: "active", finishPlace: null, bustedAt: null }).where(eq(players.id, playerId));
      await releaseSeatIfTaken(tx, gameId, playerId);
    }
    return { stack };
  });
}

export async function deleteBuyin(gameId: string, buyinId: number, actor: User) {
  await mutateGame(gameId, async ({ tx, game }) => {
    assertHost(game, actor);
    assertActive(game);
    const [b] = await tx
      .select()
      .from(buyins)
      .where(and(eq(buyins.id, buyinId), eq(buyins.gameId, gameId)))
      .limit(1);
    if (!b) throw notFound("errors.buyinNotFound");
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(buyins)
      .where(eq(buyins.playerId, b.playerId));
    if (Number(count) <= 1) throw badRequest("errors.onlyBuyin");
    const current = await currentStack(tx, b.playerId);
    await tx.delete(buyins).where(eq(buyins.id, buyinId));
    await tx
      .insert(stackSnapshots)
      .values({ gameId, playerId: b.playerId, chips: Math.max(0, current - b.chips), recordedBy: actor.id });
  });
}

/** Tournament elimination: stack goes to 0 and the player gets the next free place from the bottom. */
export async function bustPlayer(gameId: string, playerId: number, actor: User) {
  return mutateGame(gameId, async ({ tx, game, after }) => {
    assertActive(game);
    const player = await getPlayer(tx, gameId, playerId);
    assertCanEditPlayer(game, player, actor);
    if (player.status !== "active") throw badRequest("errors.alreadyBusted");
    // Counted under the game lock, so two simultaneous eliminations get different places.
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(players)
      .where(and(eq(players.gameId, gameId), eq(players.status, "active")));
    const place = game.type === "tournament" ? bustPlace(Number(count)) : null;
    await tx
      .update(players)
      .set({ status: "busted", finishPlace: place, bustedAt: new Date() })
      .where(eq(players.id, playerId));
    await tx.insert(stackSnapshots).values({ gameId, playerId, chips: 0, recordedBy: actor.id });
    if (game.type === "tournament" && game.chatId) {
      const left = Number(count) - 1;
      after(async () => {
        const lang = await langOfUser(game.hostUserId);
        await notifyChat(
          game.chatId,
          translate(lang, "msg.bust", { name: escapeHtml(player.displayName), place }) +
            (left === 1 ? translate(lang, "msg.lastOne") : translate(lang, "msg.left", { n: left })),
        );
      });
    }
    return { place };
  });
}

export async function unbustPlayer(gameId: string, playerId: number, actor: User) {
  await mutateGame(gameId, async ({ tx, game }) => {
    assertHost(game, actor);
    assertActive(game);
    const player = await getPlayer(tx, gameId, playerId);
    await tx.update(players).set({ status: "active", finishPlace: null, bustedAt: null }).where(eq(players.id, playerId));
    if (player.status !== "active") await releaseSeatIfTaken(tx, gameId, playerId);
  });
}


// ---------------------------------------------------------------- seating & dealer button

async function writeSeats(q: DbOrTx, gameId: string, moves: { playerId: number; tableNo: number | null; seatNo: number | null }[]) {
  if (!moves.length) return;
  const t = sql.join(moves.map((m) => sql`when ${m.playerId} then ${m.tableNo}::int`), sql` `);
  const s = sql.join(moves.map((m) => sql`when ${m.playerId} then ${m.seatNo}::int`), sql` `);
  await q
    .update(players)
    .set({ tableNo: sql`case ${players.id} ${t} end`, seatNo: sql`case ${players.id} ${s} end` })
    .where(and(eq(players.gameId, gameId), inArray(players.id, moves.map((m) => m.playerId))));
}

function seatLine(lang: Lang, name: string, m: SeatMove) {
  const to = translate(lang, "msg.seatTo", { t: m.to.tableNo, s: m.to.seatNo });
  return m.from
    ? translate(lang, "msg.seatMoved", { name: escapeHtml(name), to, from: m.from.tableNo })
    : translate(lang, "msg.seatNew", { name: escapeHtml(name), to });
}

/** Field-by-field comparison (jsonb does not keep key order, so JSON strings never match). */
function sameSeatingState(a: SeatingState, b: SeatingState) {
  return (
    a.seatsPerTable === b.seatsPerTable &&
    a.tables.length === b.tables.length &&
    a.tables.every((t, i) => t.no === b.tables[i].no && (t.button ?? null) === (b.tables[i].button ?? null))
  );
}

/**
 * Keeps an active game's seating consistent after any change (joins, eliminations, rebuys):
 * seats newcomers, breaks and balances tables. Returns a group message describing the moves.
 */
async function reconcileGameSeating(tx: Tx, gameId: string) {
  const [g] = await tx
    .select({ tables: games.tables, status: games.status, chatId: games.chatId })
    .from(games)
    .where(eq(games.id, gameId));
  if (!g?.tables || g.status !== "active") return null;
  const plist = await tx
    .select({ id: players.id, name: players.displayName, status: players.status, tableNo: players.tableNo, seatNo: players.seatNo })
    .from(players)
    .where(eq(players.gameId, gameId))
    .orderBy(asc(players.id));
  const r = reconcileSeating(
    g.tables,
    plist.map((p) => ({ id: p.id, active: p.status === "active", tableNo: p.tableNo, seatNo: p.seatNo })),
  );
  if (!r.moves.length && sameSeatingState(r.state, g.tables)) return null;
  await writeSeats(tx, gameId, r.moves.map((m) => ({ playerId: m.playerId, ...m.to })));
  await tx.update(games).set({ tables: r.state }).where(eq(games.id, gameId));
  const names = new Map(plist.map((p) => [p.id, p.name]));
  // Any seat change of a seated player is announced, also within the same table.
  const moved = r.moves.filter((m) => m.from);
  const seated = r.moves.filter((m) => !m.from);
  const lines = [...moved, ...seated].map((m) => ({ name: names.get(m.playerId) ?? "?", move: m }));
  return { chatId: g.chatId, lines };
}

export function seatingText(state: GameState, lang: Lang): string {
  const t = state.game.tables;
  if (!t) return "";
  return t.tables
    .map((table) => {
      const seated = state.players
        .filter((p) => p.status === "active" && p.tableNo === table.no && p.seatNo != null)
        .sort((a, b) => a.seatNo! - b.seatNo!)
        .map((p) => `  ${p.seatNo}. ${escapeHtml(p.displayName)}${p.seatNo === table.button ? " 🔘" : ""}`);
      return `${translate(lang, "msg.tableTitle", { n: table.no })}\n${seated.join("\n")}`;
    })
    .join("\n\n");
}

/** Random seat draw for all active players. */
export async function seatRandom(gameId: string, actor: User, seatsPerTable: number) {
  await mutateGame(gameId, async ({ tx, game, after }) => {
    assertHost(game, actor);
    assertActive(game);
    if (seatsPerTable < MIN_SEATS || seatsPerTable > MAX_SEATS) throw badRequest("errors.seatsRange", { min: MIN_SEATS, max: MAX_SEATS });
    const plist = await tx
      .select({ id: players.id, status: players.status })
      .from(players)
      .where(eq(players.gameId, gameId));
    const activeIds = plist.filter((p) => p.status === "active").map((p) => p.id);
    if (activeIds.length < 2) throw badRequest("errors.seatingNeedsPlayers");
    const r = randomSeating(activeIds, seatsPerTable);
    const seats = new Map(r.moves.map((m) => [m.playerId, m.to]));
    await writeSeats(
      tx,
      gameId,
      plist.map((p) => ({ playerId: p.id, tableNo: seats.get(p.id)?.tableNo ?? null, seatNo: seats.get(p.id)?.seatNo ?? null })),
    );
    await tx.update(games).set({ tables: r.state }).where(eq(games.id, gameId));
    if (game.chatId) {
      after(async () => {
        const [state, lang] = await Promise.all([loadGameState(gameId), langOfUser(game.hostUserId)]);
        await notifyChat(game.chatId, `${translate(lang, "msg.seatingDraw", { name: escapeHtml(game.name) })}\n\n${seatingText(state, lang)}`);
      });
    }
  });
}

/** Passes the dealer button to the next occupied seat of a table. */
export async function moveDealerButton(gameId: string, actor: User, tableNo: number) {
  await mutateGame(gameId, async ({ tx, game }) => {
    assertHost(game, actor);
    assertActive(game);
    const current = await tx.select({ tables: games.tables }).from(games).where(eq(games.id, gameId));
    const tables = current[0]?.tables;
    if (!tables) throw badRequest("errors.seatFirst");
    if (!tables.tables.some((t) => t.no === tableNo)) throw notFound("errors.tableNotFound");
    const plist = await tx
      .select({ id: players.id, status: players.status, tableNo: players.tableNo, seatNo: players.seatNo })
      .from(players)
      .where(eq(players.gameId, gameId));
    const next: SeatingState = moveButtonOn(
      tables,
      plist.map((p) => ({ id: p.id, active: p.status === "active", tableNo: p.tableNo, seatNo: p.seatNo })),
      tableNo,
    );
    await tx.update(games).set({ tables: next }).where(eq(games.id, gameId));
  });
}

/** Re-checks seating (balancing runs on every change anyway; this is the manual trigger). */
export async function rebalanceTables(gameId: string, actor: User) {
  await mutateGame(gameId, async ({ game }) => {
    assertHost(game, actor);
    assertActive(game);
    if (!game.tables) throw badRequest("errors.seatFirst");
  });
}

export async function clearSeating(gameId: string, actor: User) {
  await mutateGame(gameId, async ({ tx, game }) => {
    assertHost(game, actor);
    await tx.update(games).set({ tables: null }).where(eq(games.id, gameId));
    await tx.update(players).set({ tableNo: null, seatNo: null }).where(eq(players.gameId, gameId));
  });
}

// ---------------------------------------------------------------- blinds timer

export async function timerAction(gameId: string, actor: User, action: TimerAction) {
  return mutateGame(gameId, async ({ tx, game, after }) => {
    assertHost(game, actor);
    assertActive(game);
    const now = new Date();
    const next = applyTimerAction(game.blindStructure, game, action, now);
    const [updated] = await tx
      .update(games)
      .set({ ...next, timerVersion: game.timerVersion + 1 })
      .where(eq(games.id, gameId))
      .returning();
    after(async () => {
      await scheduleBlindJob(updated);
      if ((action === "next" || action === "prev") && updated.chatId) {
        const v = computeTimer(updated.blindStructure, updated, now);
        if (v.status === "running") await notifyChat(updated.chatId, levelMessage(updated, v.levelIndex, await langOfUser(updated.hostUserId)));
      }
    });
    return updated;
  });
}

export function levelMessage(game: Game, levelIndex: number, lang: Lang) {
  const level = game.blindStructure[levelIndex];
  if (!level) return "";
  const head = level.isBreak
    ? translate(lang, "msg.break")
    : translate(lang, "msg.level", { n: playingLevelNumber(game.blindStructure, levelIndex), blinds: formatBlinds(level, lang) });
  const mins = level.minutes ? translate(lang, "msg.levelMinutes", { n: level.minutes }) : "";
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
    const lang = await langOfUser(game.hostUserId);
    await notifyChat(game.chatId, levelMessage(game, v.levelIndex, lang), urlButton(translate(lang, "msg.timerBtn"), miniAppLink(game.id)));
  }
  await scheduleBlindJob(game);
  return "ok";
}

// ---------------------------------------------------------------- reminders

const REMINDER_MAX_AGE_MS = 16 * 60 * 60 * 1000;

export async function scheduleReminder(game: Game) {
  if (!game.chatId || !game.reminderIntervalMin || game.status !== "active") return;
  await scheduleJob(
    "/api/jobs/reminder",
    { gameId: game.id, version: game.reminderVersion },
    new Date(Date.now() + game.reminderIntervalMin * 60_000),
  );
}

export async function handleReminderJob(body: { gameId: string; version: number }) {
  const [game] = await db.select().from(games).where(eq(games.id, body.gameId)).limit(1);
  if (!game || game.status !== "active" || game.reminderVersion !== body.version || !game.reminderIntervalMin) {
    return "stale";
  }
  if (Date.now() - game.createdAt.getTime() > REMINDER_MAX_AGE_MS) return "expired";
  const state = await loadGameState(game.id);
  const lang = await langOfUser(game.hostUserId);
  await notifyChat(
    game.chatId,
    translate(lang, "msg.reminder", { name: escapeHtml(game.name), standings: standingsText(state, lang) }),
    urlButton(translate(lang, "msg.updateStackBtn"), miniAppLink(game.id)),
  );
  await scheduleReminder(game);
  return "ok";
}

// ---------------------------------------------------------------- end game

export async function endGame(gameId: string, actor: User, finalStacks?: Record<string, number>) {
  await mutateGame(gameId, async ({ tx, game }) => {
    assertHost(game, actor);
    assertActive(game);
    const state = await loadGameState(gameId, tx);
    const finals = state.players.map((p) => {
      const raw = finalStacks?.[String(p.id)];
      const chips = raw != null && Number.isInteger(raw) && raw >= 0 && raw <= MAX_STACK ? raw : p.currentChips;
      return { p, chips };
    });
    const changed = finals.filter((f) => f.chips !== f.p.currentChips);
    if (changed.length) {
      await tx
        .insert(stackSnapshots)
        .values(changed.map((f) => ({ gameId, playerId: f.p.id, chips: f.chips, recordedBy: actor.id })));
    }
    if (finals.length) {
      // Freeze final stacks and (tournaments) places for everyone still in, ranked by chips.
      const results = computeResults(
        game,
        finals.map((f) => ({ ...f.p, currentChips: f.chips, finalChips: f.chips })),
      );
      const place = new Map(results.map((r) => [r.playerId, r.place]));
      const chipsCase = sql.join(finals.map((f) => sql`when ${f.p.id} then ${f.chips}::int`), sql` `);
      const placeCase = sql.join(finals.map((f) => sql`when ${f.p.id} then ${place.get(f.p.id) ?? null}::int`), sql` `);
      await tx
        .update(players)
        .set({
          finalChips: sql`case ${players.id} ${chipsCase} end`,
          ...(game.type === "tournament" ? { finishPlace: sql`case ${players.id} ${placeCase} end` } : {}),
        })
        .where(eq(players.gameId, gameId));
    }
    await tx
      .update(games)
      .set({
        status: "finished",
        joinCode: null,
        finishedAt: new Date(),
        levelStartedAt: null,
        pausedRemainingMs: null,
        timerVersion: game.timerVersion + 1,
        reminderVersion: game.reminderVersion + 1,
      })
      .where(eq(games.id, gameId));
  });
  return loadGameState(gameId);
}

export async function reopenGame(gameId: string, actor: User) {
  await mutateGame(gameId, async ({ tx, game }) => {
    assertHost(game, actor);
    if (game.status !== "finished") throw badRequest("errors.gameStillActive");
    await tx.update(games).set({ status: "active", finishedAt: null, joinCode: null }).where(eq(games.id, gameId));
    await tx.update(players).set({ finalChips: null }).where(eq(players.gameId, gameId));
    if (game.type === "tournament") {
      await tx
        .update(players)
        .set({ finishPlace: null })
        .where(and(eq(players.gameId, gameId), eq(players.status, "active")));
    }
  });
  await assignJoinCode(gameId);
}

// ---------------------------------------------------------------- text summaries (bot)

export function standingsText(state: GameState, lang: Lang): string {
  const { game } = state;
  const lines = state.results.map((r) => {
    const p = state.players.find((x) => x.id === r.playerId)!;
    const name = escapeHtml(r.displayName);
    if (game.type === "tournament") {
      if (p.status === "busted") return `  ${r.place}. <s>${name}</s>`;
      return `  ${r.place}. ${name} — ${fmtChips(r.finalChips)}`;
    }
    return `  ${r.place}. ${name} — ${fmtChips(r.finalChips)} (${fmtSigned(r.netChips)})`;
  });
  const diff = state.check.diff;
  const warn = diff !== 0 ? translate(lang, "msg.chipDiff", { diff: fmtSigned(diff) }) : "";
  return (lines.join("\n") || translate(lang, "msg.nobodyYet")) + warn;
}

export function summaryText(state: GameState, lang: Lang): string {
  const { game } = state;
  const medals = ["🥇", "🥈", "🥉"];
  const lines = state.results.map((r) => {
    const m = medals[r.place - 1] ?? `${r.place}.`;
    const name = escapeHtml(r.displayName);
    if (game.type === "tournament") return `${m} ${name} — ${translate(lang, "common.pointsShort", { n: r.points ?? 0 })}`;
    return `${m} ${name}: ${fmtSigned(r.netChips)} (${fmtBuyins(r.netBuyins, lang)})`;
  });
  const n = state.players.reduce((s, p) => s + p.buyinCount, 0);
  const type = translate(lang, game.type === "cash" ? "common.cash" : "common.tournament");
  return (
    `${translate(lang, "msg.finished", { name: escapeHtml(game.name) })}\n` +
    `${type} · ${translate(lang, "common.players", { n: state.players.length })} · ${translate(lang, "common.buyins", { n })}\n\n` +
    lines.join("\n")
  );
}

/** `includeIds`: Telegram user ids are only for the game's own participants, not anonymous visitors. */
export function gameCsv(state: GameState, opts: { includeIds?: boolean; lang?: Lang } = {}): string {
  const { game } = state;
  const ids = opts.includeIds !== false;
  const t = (k: Parameters<typeof translate>[1]) => translate(opts.lang ?? "uk", k);
  const header = [
    t("csv.place"),
    t("csv.player"),
    ...(ids ? [t("csv.tgId")] : []),
    t("csv.buyins"),
    t("csv.buyinChips"),
    t("csv.final"),
    t("csv.netChips"),
    t("csv.netBuyins"),
    t("csv.points"),
  ];
  const rows = state.results.map((r) => [
    r.place,
    r.displayName,
    ...(ids ? [r.userId ?? ""] : []),
    r.buyinCount,
    r.buyinChips,
    r.finalChips,
    r.netChips,
    r.netBuyins,
    r.points ?? "",
  ]);
  const meta = [
    [t("csv.game"), game.name],
    [t("csv.type"), t(game.type === "cash" ? "common.cash" : "common.tournament")],
    [t("csv.startStack"), game.startingStack],
    [t("csv.created"), game.createdAt.toISOString()],
    [t("csv.finishedAt"), game.finishedAt?.toISOString() ?? ""],
    [],
  ];
  return "\uFEFF" + [...meta, header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
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

// ---------------------------------------------------------------- API view

export type ViewerRole = "host" | "player" | "viewer";

/**
 * Game state as one viewer sees it. Outsiders (not host, not seated) get Telegram ids replaced with
 * stable per-response pseudonyms — equality checks in the UI keep working, real ids don't leak.
 */
export function gameStateForViewer(state: GameState, viewer: User | null) {
  const me = viewer ? state.players.find((p) => p.userId === viewer.id) : undefined;
  const role: ViewerRole = isHost(state.game, viewer?.id) ? "host" : me ? "player" : "viewer";
  let s = state;
  if (role === "viewer") {
    const alias = new Map<number, number>();
    const pseudo = (id: number | null) => {
      if (id == null) return null;
      if (!alias.has(id)) alias.set(id, -(alias.size + 1));
      return alias.get(id)!;
    };
    s = {
      ...state,
      game: { ...state.game, hostUserId: pseudo(state.game.hostUserId)!, chatId: state.game.chatId == null ? null : -1 },
      host: { ...state.host, id: pseudo(state.host.id)! },
      players: state.players.map((p) => ({ ...p, userId: pseudo(p.userId) })),
      results: state.results.map((r) => ({ ...r, userId: pseudo(r.userId), key: `p:${r.playerId}` })),
    };
  }
  return {
    ...s,
    viewer: viewer ? { id: viewer.id, firstName: viewer.firstName } : null,
    role,
    myPlayerId: me?.id ?? null,
    serverNow: Date.now(),
  };
}

/** Whether the user may see participant details (Telegram ids) of a game. */
export function isParticipant(state: GameState, userId: number | null | undefined) {
  return userId != null && (isHost(state.game, userId) || state.players.some((p) => p.userId === userId));
}
