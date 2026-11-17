import { describe, expect, it } from "vitest";
import {
  isBalanced,
  moveButton,
  nextOccupiedSeat,
  randomSeating,
  reconcileSeating,
  tableLayout,
  tablesNeeded,
  type SeatPlayer,
  type SeatingResult,
} from "./seating";

/** Deterministic PRNG (mulberry32). */
function rng(seed = 1) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function apply(players: SeatPlayer[], r: SeatingResult): SeatPlayer[] {
  return players.map((p) => {
    const m = r.moves.find((x) => x.playerId === p.id);
    return m ? { ...p, tableNo: m.to.tableNo, seatNo: m.to.seatNo } : p;
  });
}

function seated(n: number, per: number, seed = 1) {
  const r = randomSeating(ids(n), per, rng(seed));
  const players = apply(
    ids(n).map((id) => ({ id, active: true, tableNo: null, seatNo: null })),
    r,
  );
  return { state: r.state, players };
}

function assertValid(players: SeatPlayer[], per: number) {
  const active = players.filter((p) => p.active);
  const keys = active.map((p) => `${p.tableNo}:${p.seatNo}`);
  expect(new Set(keys).size).toBe(keys.length);
  for (const p of active) {
    expect(p.tableNo).not.toBeNull();
    expect(p.seatNo).toBeGreaterThanOrEqual(1);
    expect(p.seatNo).toBeLessThanOrEqual(per);
  }
}

describe("seating", () => {
  it("counts tables", () => {
    expect(tablesNeeded(0, 9)).toBe(1);
    expect(tablesNeeded(9, 9)).toBe(1);
    expect(tablesNeeded(10, 9)).toBe(2);
    expect(tablesNeeded(19, 9)).toBe(3);
  });

  it("draws seats evenly over the minimum number of tables", () => {
    const { state, players } = seated(14, 9);
    expect(state.tables.map((t) => t.no)).toEqual([1, 2]);
    assertValid(players, 9);
    expect(isBalanced(state, players)).toBe(true);
    const sizes = state.tables.map((t) => players.filter((p) => p.tableNo === t.no).length);
    expect(sizes.sort()).toEqual([7, 7]);
    // Buttons sit on occupied seats.
    for (const t of state.tables) expect(players.some((p) => p.tableNo === t.no && p.seatNo === t.button)).toBe(true);
  });

  it("clamps seats per table", () => {
    expect(randomSeating(ids(3), 50).state.seatsPerTable).toBe(10);
    expect(randomSeating(ids(3), 1).state.seatsPerTable).toBe(2);
  });

  it("moves the button clockwise over occupied seats", () => {
    expect(nextOccupiedSeat([2, 5, 8], 5)).toBe(8);
    expect(nextOccupiedSeat([2, 5, 8], 8)).toBe(2);
    expect(nextOccupiedSeat([2, 5, 8], 3)).toBe(5);
    expect(nextOccupiedSeat([], 3)).toBeNull();
    const state = { seatsPerTable: 9, tables: [{ no: 1, button: 2 }] };
    const players: SeatPlayer[] = [
      { id: 1, active: true, tableNo: 1, seatNo: 2 },
      { id: 2, active: false, tableNo: 1, seatNo: 4 },
      { id: 3, active: true, tableNo: 1, seatNo: 7 },
    ];
    expect(moveButton(state, players, 1).tables[0].button).toBe(7);
  });

  it("balances after eliminations: the next big blind moves from the biggest to the smallest table", () => {
    const state = { seatsPerTable: 6, tables: [{ no: 1, button: 1 }, { no: 2, button: 1 }] };
    const players: SeatPlayer[] = [
      ...[1, 2, 3, 4, 5, 6].map((s) => ({ id: s, active: true, tableNo: 1, seatNo: s })),
      ...[1, 2, 3, 4].map((s) => ({ id: 10 + s, active: s <= 2, tableNo: 2, seatNo: s })),
    ];
    const r = reconcileSeating(state, players, rng(3));
    expect(r.moves).toHaveLength(2);
    // Button on seat 1 → small blind seat 2 → big blind seat 3 moves first.
    expect(r.moves[0]).toMatchObject({ playerId: 3, from: { tableNo: 1, seatNo: 3 }, to: { tableNo: 2 } });
    const after = apply(players, r);
    assertValid(after, 6);
    expect(isBalanced(r.state, after)).toBe(true);
  });

  it("breaks a table when the field fits on fewer tables", () => {
    const { state, players } = seated(12, 6, 7);
    expect(state.tables).toHaveLength(2);
    // Six players bust, three from each table.
    const out = new Set<number>();
    for (const t of state.tables) players.filter((p) => p.tableNo === t.no).slice(0, 3).forEach((p) => out.add(p.id));
    const left = players.map((p) => ({ ...p, active: !out.has(p.id) }));
    const r = reconcileSeating(state, left, rng(2));
    expect(r.state.tables).toHaveLength(1);
    const after = apply(left, r);
    assertValid(after, 6);
    expect(after.filter((p) => p.active).every((p) => p.tableNo === r.state.tables[0].no)).toBe(true);
    // Only the players of the broken table moved.
    expect(r.moves).toHaveLength(3);
  });

  it("seats late joiners and players whose seat was taken, opening a table when all are full", () => {
    const { state, players } = seated(4, 4, 5);
    const withNew: SeatPlayer[] = [...players, { id: 99, active: true, tableNo: null, seatNo: null }];
    const r = reconcileSeating(state, withNew, rng(1));
    expect(r.state.tables).toHaveLength(2);
    const after = apply(withNew, r);
    assertValid(after, 4);
    expect(isBalanced(r.state, after)).toBe(true);

    // Two active players on the same seat (one came back after a rebuy): one is reseated.
    const clash = after.map((p) => (p.id === 99 ? { ...p, tableNo: after[0].tableNo, seatNo: after[0].seatNo } : p));
    const fixed = apply(clash, reconcileSeating(r.state, clash, rng(4)));
    assertValid(fixed, 4);
  });

  it("is a no-op when everything is in order", () => {
    const { state, players } = seated(9, 9);
    expect(reconcileSeating(state, players).moves).toEqual([]);
  });

  it("lays out tables seat by seat", () => {
    const { state, players } = seated(3, 4);
    const layout = tableLayout(state, players);
    expect(layout[0].seats).toHaveLength(4);
    expect(layout[0].seats.filter((s) => s.playerId != null)).toHaveLength(3);
  });

  it("keeps seats valid over a long random tournament", () => {
    const rand = rng(42);
    let { state, players } = seated(23, 8, 42);
    while (players.filter((p) => p.active).length > 1) {
      const alive = players.filter((p) => p.active);
      const victim = alive[Math.floor(rand() * alive.length)];
      players = players.map((p) => (p.id === victim.id ? { ...p, active: false } : p));
      const r = reconcileSeating(state, players, rand);
      state = r.state;
      players = apply(players, r);
      assertValid(players, 8);
      expect(isBalanced(state, players)).toBe(true);
      expect(state.tables.length).toBe(tablesNeeded(players.filter((p) => p.active).length, 8));
    }
  });
});
