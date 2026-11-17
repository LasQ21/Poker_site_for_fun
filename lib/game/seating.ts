/**
 * Table seating for home tournaments: random draw, late seating, table breaking, balancing and the
 * dealer button. Pure functions — the server persists the result.
 */

export interface SeatingTable {
  no: number;
  /** Seat number of the dealer button (may point at an empty seat: "dead button"). */
  button: number | null;
}

export interface SeatingState {
  seatsPerTable: number;
  /** Live tables (broken tables are removed). */
  tables: SeatingTable[];
}

export interface SeatPlayer {
  id: number;
  /** Only active players occupy seats; busted/left players keep their old numbers but don't count. */
  active: boolean;
  tableNo: number | null;
  seatNo: number | null;
}

export interface SeatMove {
  playerId: number;
  from: { tableNo: number; seatNo: number } | null;
  to: { tableNo: number; seatNo: number };
}

export interface SeatingResult {
  state: SeatingState;
  /** Every changed seat: newly seated players have `from: null`. */
  moves: SeatMove[];
}

export const MIN_SEATS = 2;
export const MAX_SEATS = 10;

type Rand = () => number;

export function tablesNeeded(players: number, seatsPerTable: number) {
  return Math.max(1, Math.ceil(players / Math.max(1, seatsPerTable)));
}

function shuffle<T>(xs: T[], rand: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(xs: T[], rand: Rand): T {
  return xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))];
}

/** Random draw: players spread evenly over the minimum number of tables, random seats and buttons. */
export function randomSeating(playerIds: number[], seatsPerTable: number, rand: Rand = Math.random): SeatingResult {
  const per = Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.floor(seatsPerTable)));
  const count = tablesNeeded(playerIds.length, per);
  const order = shuffle(playerIds, rand);
  const byTable: number[][] = Array.from({ length: count }, () => []);
  order.forEach((id, i) => byTable[i % count].push(id));

  const moves: SeatMove[] = [];
  const tables: SeatingTable[] = byTable.map((ids, t) => {
    const seats = shuffle(
      Array.from({ length: per }, (_, i) => i + 1),
      rand,
    ).slice(0, ids.length);
    ids.forEach((id, i) => moves.push({ playerId: id, from: null, to: { tableNo: t + 1, seatNo: seats[i] } }));
    return { no: t + 1, button: seats.length ? pick(seats, rand) : null };
  });
  return { state: { seatsPerTable: per, tables }, moves };
}

/** Occupied seats of a table, ascending. */
function occupied(players: SeatPlayer[], tableNo: number): number[] {
  return players
    .filter((p) => p.active && p.tableNo === tableNo && p.seatNo != null)
    .map((p) => p.seatNo!)
    .sort((a, b) => a - b);
}

/** Next occupied seat clockwise (increasing numbers, wrapping) strictly after `from`. */
export function nextOccupiedSeat(seats: number[], from: number | null): number | null {
  if (!seats.length) return null;
  if (from == null) return seats[0];
  return seats.find((s) => s > from) ?? seats[0];
}

/** Moves the button of one table to the next occupied seat. */
export function moveButton(state: SeatingState, players: SeatPlayer[], tableNo: number): SeatingState {
  return {
    ...state,
    tables: state.tables.map((t) =>
      t.no === tableNo ? { ...t, button: nextOccupiedSeat(occupied(players, t.no), t.button) } : t,
    ),
  };
}

/**
 * Brings seating in line with who is still playing:
 *  1. active players without a valid seat (late joiners, players back after a rebuy whose seat was
 *     taken) are seated at the emptiest table — a new table is opened when all are full;
 *  2. tables are broken while fewer tables would do (players go to the emptiest tables);
 *  3. tables are balanced (max − min ≤ 1): the player due to post the big blind next on the
 *     biggest table moves to the smallest one.
 */
export function reconcileSeating(state: SeatingState, input: SeatPlayer[], rand: Rand = Math.random): SeatingResult {
  const per = state.seatsPerTable;
  const players = input.map((p) => ({ ...p }));
  let tables = state.tables.map((t) => ({ ...t }));
  const moves = new Map<number, SeatMove>();
  const original = new Map(input.map((p) => [p.id, p.tableNo != null && p.seatNo != null ? { tableNo: p.tableNo, seatNo: p.seatNo } : null]));

  const sizeOf = (no: number) => occupied(players, no).length;
  const freeSeats = (no: number) => {
    const taken = new Set(occupied(players, no));
    return Array.from({ length: per }, (_, i) => i + 1).filter((s) => !taken.has(s));
  };
  const seat = (p: SeatPlayer, tableNo: number) => {
    const seatNo = pick(freeSeats(tableNo), rand);
    p.tableNo = tableNo;
    p.seatNo = seatNo;
    const from = original.get(p.id) ?? null;
    if (from && from.tableNo === tableNo && from.seatNo === seatNo) moves.delete(p.id);
    else moves.set(p.id, { playerId: p.id, from, to: { tableNo, seatNo } });
  };
  const emptiest = (exclude?: number) =>
    tables
      .filter((t) => t.no !== exclude && sizeOf(t.no) < per)
      .sort((a, b) => sizeOf(a.no) - sizeOf(b.no) || a.no - b.no)[0];
  const openTable = () => {
    const t = { no: Math.max(0, ...tables.map((x) => x.no)) + 1, button: null };
    tables.push(t);
    return t;
  };

  // 1. Seat whoever has no valid seat. Players sitting in the same seat: the first keeps it.
  const live = new Set(tables.map((t) => t.no));
  const seen = new Set<string>();
  const unseated: SeatPlayer[] = [];
  for (const p of players) {
    if (!p.active) continue;
    const key = `${p.tableNo}:${p.seatNo}`;
    if (p.tableNo == null || p.seatNo == null || !live.has(p.tableNo) || p.seatNo < 1 || p.seatNo > per || seen.has(key)) {
      unseated.push(p);
      p.tableNo = null;
      p.seatNo = null;
    } else seen.add(key);
  }
  for (const p of shuffle(unseated, rand)) seat(p, (emptiest() ?? openTable()).no);

  // 2. Break tables while the field fits on fewer.
  const activeCount = players.filter((p) => p.active).length;
  while (tables.length > tablesNeeded(activeCount, per)) {
    const victim = [...tables].sort((a, b) => sizeOf(a.no) - sizeOf(b.no) || b.no - a.no)[0];
    const leaving = players.filter((p) => p.active && p.tableNo === victim.no);
    tables = tables.filter((t) => t.no !== victim.no);
    for (const p of shuffle(leaving, rand)) {
      p.tableNo = null;
      p.seatNo = null;
      seat(p, (emptiest() ?? openTable()).no);
    }
  }

  // 3. Balance.
  for (let guard = 0; guard < 100 && tables.length > 1; guard++) {
    const sorted = [...tables].sort((a, b) => sizeOf(b.no) - sizeOf(a.no) || a.no - b.no);
    const big = sorted[0];
    const small = sorted[sorted.length - 1];
    if (sizeOf(big.no) - sizeOf(small.no) <= 1) break;
    const seats = occupied(players, big.no);
    const sb = nextOccupiedSeat(seats, big.button);
    const bbSeat = nextOccupiedSeat(seats, sb);
    const mover = players.find((p) => p.active && p.tableNo === big.no && p.seatNo === bbSeat)!;
    seat(mover, small.no);
  }

  // Tables that got their first players get a random button.
  for (const t of tables) {
    const seats = occupied(players, t.no);
    if (t.button == null && seats.length) t.button = pick(seats, rand);
  }

  return { state: { seatsPerTable: per, tables }, moves: [...moves.values()] };
}

/** Tables with their active players by seat (for display). */
export function tableLayout(state: SeatingState, players: SeatPlayer[]) {
  return state.tables.map((t) => ({
    ...t,
    seats: Array.from({ length: state.seatsPerTable }, (_, i) => {
      const seatNo = i + 1;
      return { seatNo, playerId: players.find((p) => p.active && p.tableNo === t.no && p.seatNo === seatNo)?.id ?? null };
    }),
  }));
}

export function isBalanced(state: SeatingState, players: SeatPlayer[]) {
  const sizes = state.tables.map((t) => occupied(players, t.no).length);
  return sizes.length < 2 || Math.max(...sizes) - Math.min(...sizes) <= 1;
}
