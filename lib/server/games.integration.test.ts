/**
 * Game service against a real Postgres: permissions, concurrency, buy-ins, ending, join codes.
 * Runs only when TEST_DATABASE_URL is set, e.g.:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/poker npm test
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { User } from "@/lib/db/schema";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("game service (integration)", () => {
  let G: typeof import("./games");
  let host: User, anna: User, ivan: User, guest: User;
  const IDS = [7101, 7102, 7103, 7104];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.BOT_TOKEN = "";
    const { db } = await import("@/lib/db");
    const { games, users, joinAttempts } = await import("@/lib/db/schema");
    const { inArray } = await import("drizzle-orm");
    await db.delete(games).where(inArray(games.hostUserId, IDS));
    await db.delete(joinAttempts).where(inArray(joinAttempts.userId, IDS));
    await db.delete(users).where(inArray(users.id, IDS));
    const { upsertUser } = await import("./users");
    [host, anna, ivan, guest] = await Promise.all(
      ["Хост", "Анна", "Іван", "Гість"].map((first_name, i) => upsertUser({ id: IDS[i], first_name })),
    );
    G = await import("./games");
  });

  async function tournament(names: User[] = [anna, ivan]) {
    const game = await G.createGame(host, { type: "tournament", startingStack: 1000 });
    for (const u of names) await G.joinGame(game.id, u);
    const state = await G.loadGameState(game.id);
    const pid = (u: User) => state.players.find((p) => p.userId === u.id)!.id;
    return { game, pid };
  }

  it("enforces host / own-player / guest permissions", async () => {
    const { game, pid } = await tournament();
    await G.setStack(game.id, pid(anna), anna, 1500);
    await expect(G.setStack(game.id, pid(ivan), anna, 0)).rejects.toThrow(/свій стек/);
    await expect(G.setStack(game.id, pid(anna), guest, 0)).rejects.toThrow(/свій стек/);
    await G.setStack(game.id, pid(ivan), host, 500);
    await expect(G.addPlayer(game.id, anna, "Хтось")).rejects.toThrow(/хост/);
    await expect(G.timerAction(game.id, anna, "start")).rejects.toThrow(/хост/);
    const s = await G.loadGameState(game.id);
    expect(s.players.find((p) => p.userId === anna.id)?.currentChips).toBe(1500);
    expect(s.check.diff).toBe(0);
  });

  it("does not let a busted player put themselves back via updatePlayer", async () => {
    const { game, pid } = await tournament([anna, ivan, guest]);
    const { place } = await G.bustPlayer(game.id, pid(anna), anna);
    expect(place).toBe(4);
    await expect(G.updatePlayer(game.id, pid(anna), anna, { status: "active" })).rejects.toThrow(/хост/);
    // Renaming yourself is still fine.
    await G.updatePlayer(game.id, pid(anna), anna, { displayName: "Аня" });
    // The host can, and the stale place is cleared.
    await G.updatePlayer(game.id, pid(anna), host, { status: "active" });
    const p = (await G.loadGameState(game.id)).players.find((x) => x.id === pid(anna))!;
    expect(p).toMatchObject({ status: "active", finishPlace: null, bustedAt: null, displayName: "Аня" });
  });

  it("gives simultaneous eliminations different places", async () => {
    const { game, pid } = await tournament([anna, ivan, guest]);
    const places = await Promise.all([anna, ivan, guest].map((u) => G.bustPlayer(game.id, pid(u), u)));
    expect(places.map((p) => p.place).sort()).toEqual([2, 3, 4]);
  });

  it("applies concurrent rebuys without losing chips", async () => {
    const { game, pid } = await tournament();
    await Promise.all([1, 2, 3].map(() => G.addBuyin(game.id, pid(anna), anna, "rebuy", 100)));
    const s = await G.loadGameState(game.id);
    const a = s.players.find((p) => p.id === pid(anna))!;
    expect(a.currentChips).toBe(1300);
    expect(a.buyinCount).toBe(4);
    expect(s.check.diff).toBe(0);
  });

  it("refuses to delete a player's only buy-in", async () => {
    const { game, pid } = await tournament();
    const s = await G.loadGameState(game.id);
    const only = s.buyins.find((b) => b.playerId === pid(anna))!;
    await expect(G.deleteBuyin(game.id, only.id, host)).rejects.toThrow(/єдиний бай-ін/);
    await G.addBuyin(game.id, pid(anna), anna, "rebuy");
    await G.deleteBuyin(game.id, only.id, host);
    const a = (await G.loadGameState(game.id)).players.find((p) => p.id === pid(anna))!;
    expect(a.buyinCount).toBe(1);
    expect(a.currentChips).toBe(1000);
  });

  it("ends and reopens a tournament with frozen places", async () => {
    const { game, pid } = await tournament();
    await G.bustPlayer(game.id, pid(ivan), ivan);
    const final = await G.endGame(game.id, host, { [String(pid(anna))]: 2000 });
    expect(final.game.status).toBe("finished");
    expect(final.game.joinCode).toBeNull();
    expect(final.results.map((r) => [r.displayName, r.place, r.points])).toEqual([
      ["Анна", 1, 5],
      ["Хост", 2, 2],
      ["Іван", 3, 1],
    ]);
    expect(final.players.find((p) => p.id === pid(anna))?.finalChips).toBe(2000);
    await expect(G.setStack(game.id, pid(anna), anna, 1)).rejects.toThrow(/завершено/);
    await expect(G.endGame(game.id, anna)).rejects.toThrow(/хост/);

    await G.reopenGame(game.id, host);
    const s = await G.loadGameState(game.id);
    expect(s.game.status).toBe("active");
    expect(s.game.joinCode).toMatch(/^\d{4}$/);
    expect(s.players.find((p) => p.id === pid(anna))).toMatchObject({ finishPlace: null, finalChips: null });
    expect(s.players.find((p) => p.id === pid(ivan))?.finishPlace).toBe(3);
  });

  it("bumps the version on every mutation", async () => {
    const { game, pid } = await tournament();
    const v0 = (await G.getGame(game.id)).version;
    await G.setStack(game.id, pid(anna), anna, 900);
    await expect(G.setStack(game.id, pid(anna), ivan, 900)).rejects.toThrow();
    expect((await G.getGame(game.id)).version).toBe(v0 + 1);
  });

  it("rate-limits wrong join codes per user", async () => {
    const { game } = await tournament([]);
    const code = (await G.getGame(game.id)).joinCode!;
    const wrong = code === "1000" ? "1001" : "1000";
    const { db } = await import("@/lib/db");
    const { games } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(games).set({ joinCode: null }).where(eq(games.joinCode, wrong));
    for (let i = 0; i < G.JOIN_MAX_FAILS; i++) {
      await expect(G.joinByCode(guest, wrong)).rejects.toMatchObject({ status: 404 });
    }
    await expect(G.joinByCode(guest, code)).rejects.toMatchObject({ status: 429 });
    // Other users are not affected.
    expect(await G.joinByCode(anna, code)).toMatchObject({ gameId: game.id, status: "joined" });
  });

  it("releases join codes of games idle for a day", async () => {
    const { game } = await tournament([]);
    const { db } = await import("@/lib/db");
    const { games } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const code = (await G.getGame(game.id)).joinCode!;
    await db.update(games).set({ updatedAt: new Date(Date.now() - G.IDLE_MS - 60_000) }).where(eq(games.id, game.id));
    await expect(G.findActiveGameByCode(code)).rejects.toMatchObject({ status: 404 });
    const other = await G.createGame(host, { type: "cash", startingStack: 100 });
    expect(other.joinCode).toMatch(/^\d{4}$/);
    const idle = await G.loadGameState(game.id);
    expect(idle.idle).toBe(true);
    expect(idle.game.joinCode).toBeNull();
    // Any action revives the game, and it gets a fresh code.
    await G.addPlayer(game.id, host, "Петро");
    const revived = await G.loadGameState(game.id);
    expect(revived.idle).toBe(false);
    expect(revived.game.joinCode).toMatch(/^\d{4}$/);
  });

  it("hides Telegram ids from outsiders", async () => {
    const { game } = await tournament();
    const state = await G.loadGameState(game.id);
    const outsider = G.gameStateForViewer(state, guest);
    expect(outsider.role).toBe("viewer");
    const json = JSON.stringify(outsider);
    for (const id of [host.id, anna.id, ivan.id]) expect(json).not.toContain(String(id));
    expect(outsider.players.find((p) => p.displayName === "Хост")?.userId).toBe(outsider.game.hostUserId);
    expect(G.gameStateForViewer(state, anna).role).toBe("player");
    expect(G.gameCsv(state, { includeIds: false })).not.toContain(String(anna.id));
    expect(G.gameCsv(state)).toContain(String(anna.id));
  });

  it("seats players, balances tables after eliminations and seats late joiners", async () => {
    const game = await G.createGame(host, { type: "tournament", startingStack: 1000, playerNames: ["A", "B", "C", "D", "E", "F", "G"] });
    await G.seatRandom(game.id, host, 4);
    await expect(G.seatRandom(game.id, anna, 4)).rejects.toThrow(/хост/);
    let s = await G.loadGameState(game.id);
    expect(s.game.tables?.tables.map((t) => t.no)).toEqual([1, 2]);
    const sizes = (st: typeof s) =>
      st.game.tables!.tables.map((t) => st.players.filter((p) => p.status === "active" && p.tableNo === t.no).length).sort();
    expect(sizes(s)).toEqual([4, 4]);

    // Bust two players from the same table → the other table sends one over.
    const t1 = s.players.filter((p) => p.tableNo === 1);
    for (const p of t1.slice(0, 2)) await G.bustPlayer(game.id, p.id, host);
    s = await G.loadGameState(game.id);
    expect(sizes(s)).toEqual([3, 3]);

    // A late joiner gets a seat; seats stay unique.
    await G.joinGame(game.id, ivan);
    s = await G.loadGameState(game.id);
    const ivanP = s.players.find((p) => p.userId === ivan.id)!;
    expect(ivanP.tableNo).not.toBeNull();
    const keys = s.players.filter((p) => p.status === "active").map((p) => `${p.tableNo}:${p.seatNo}`);
    expect(new Set(keys).size).toBe(keys.length);

    // Down to four players → one table.
    const alive = s.players.filter((p) => p.status === "active");
    for (const p of alive.slice(0, 3)) await G.bustPlayer(game.id, p.id, host);
    s = await G.loadGameState(game.id);
    expect(s.game.tables?.tables).toHaveLength(1);
    expect(s.players.filter((p) => p.status === "active").every((p) => p.tableNo === s.game.tables!.tables[0].no)).toBe(true);

    const before = s.game.tables!.tables[0].button;
    await G.moveDealerButton(game.id, host, s.game.tables!.tables[0].no);
    s = await G.loadGameState(game.id);
    const btn = s.game.tables!.tables[0].button;
    expect(btn).not.toBe(before);
    expect(s.players.some((p) => p.status === "active" && p.seatNo === btn)).toBe(true);

    await G.clearSeating(game.id, host);
    s = await G.loadGameState(game.id);
    expect(s.game.tables).toBeNull();
    expect(s.players.every((p) => p.tableNo == null)).toBe(true);
  });

  it("builds a player's profile stats from finished games", async () => {
    const { loadPlayerStats } = await import("./stats");
    const before = await loadPlayerStats(ivan.id);
    const { game, pid } = await tournament([anna, ivan]);
    await G.bustPlayer(game.id, pid(anna), anna);
    await G.endGame(game.id, host, { [String(pid(ivan))]: 2000 });
    const after = await loadPlayerStats(ivan.id);
    expect(after.games).toBe(before.games + 1);
    expect(after.wins).toBe(before.wins + 1);
    expect(after.form[0]).toMatchObject({ gameId: game.id, place: 1, entrants: 3 });
    expect(after.achievements.find((a) => a.id === "first_win")?.achieved).toBe(true);
  });

  it("probes versions and builds per-viewer ETags", async () => {
    const { game, pid } = await tournament();
    const v1 = (await G.gameVersion(game.id))!;
    expect(G.gameEtag(v1, anna.id)).toBe(G.gameEtag(v1, anna.id));
    expect(G.gameEtag(v1, anna.id)).not.toBe(G.gameEtag(v1, ivan.id));
    expect(G.gameEtag(v1, null)).not.toBe(G.gameEtag({ ...v1, idle: true }, null));
    await G.setStack(game.id, pid(anna), anna, 1200);
    const v2 = (await G.gameVersion(game.id))!;
    expect(v2.version).toBe(v1.version + 1);
    expect(G.gameEtag(v2, anna.id)).not.toBe(G.gameEtag(v1, anna.id));
    expect(await G.gameVersion("missing-game")).toBeNull();
  });

  it("lets only group admins or hosts of the group's games manage seasons", async () => {
    const { db } = await import("@/lib/db");
    const { chats } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const L = await import("./leaderboard");
    const U = await import("./users");
    const CHAT = -100555;
    await db.delete(chats).where(eq(chats.id, CHAT));
    await U.upsertChat(CHAT, "Seasons test");
    for (const u of [host, anna, guest]) await U.touchMember(CHAT, u.id);
    // Nobody has hosted a game here yet and there is no bot token to ask Telegram about admins.
    await expect(L.startSeason(CHAT, anna.id, "Осінь")).rejects.toMatchObject({ status: 403 });
    await G.createGame(host, { type: "cash", startingStack: 100, chatId: CHAT });
    const s = await L.startSeason(CHAT, host.id, "Осінь");
    expect(s.isActive).toBe(true);
    await expect(L.endSeason(CHAT, guest.id)).rejects.toMatchObject({ status: 403 });
    expect((await L.endSeason(CHAT, host.id))?.id).toBe(s.id);
    // Leaving the group revokes membership (and with it the right to create games there).
    await U.removeMember(CHAT, host.id);
    await expect(G.createGame(host, { type: "cash", startingStack: 100, chatId: CHAT })).rejects.toMatchObject({ status: 403 });
    await U.forgetChatMembers(CHAT);
    expect(await L.isChatMember(CHAT, anna.id)).toBe(false);
    await db.delete(chats).where(eq(chats.id, CHAT));
  });
});
