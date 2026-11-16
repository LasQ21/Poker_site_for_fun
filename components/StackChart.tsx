"use client";

import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtChips } from "@/lib/format";
import type { GameStateDTO } from "@/lib/types";
import { playerColor } from "./StackTable";

const time = (t: number) => new Date(t).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const compact = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

/** Stack of every player over time; values carry forward between updates (step lines). */
export default function StackChart({ state, height = 260 }: { state: GameStateDTO; height?: number }) {
  const data = useMemo(() => {
    const cur: Record<string, number> = {};
    const rows: Record<string, number>[] = [];
    for (const s of state.snapshots) {
      cur[`p${s.playerId}`] = s.chips;
      const last = rows[rows.length - 1];
      // Merge updates that land within the same minute into one point.
      if (last && s.t - last.t < 60_000) Object.assign(last, cur, { t: last.t });
      else rows.push({ t: s.t, ...cur });
    }
    const end = state.game.finishedAt ? new Date(state.game.finishedAt).getTime() : state.serverNow;
    if (rows.length && end > rows[rows.length - 1].t) rows.push({ ...rows[rows.length - 1], t: end });
    return rows;
  }, [state.snapshots, state.game.finishedAt, state.serverNow]);

  if (data.length < 2) {
    return <div className="px-4 py-8 text-center text-sm text-hint">Графік з&apos;явиться після перших оновлень стеків.</div>;
  }

  return (
    <div className="px-1 pt-3" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--app-separator)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={time}
            tick={{ fill: "var(--app-hint)", fontSize: 11 }}
            stroke="var(--app-separator)"
            minTickGap={30}
          />
          <YAxis tickFormatter={compact} tick={{ fill: "var(--app-hint)", fontSize: 11 }} stroke="var(--app-separator)" width={44} />
          <Tooltip
            labelFormatter={(t) => time(Number(t))}
            formatter={(v, key) => [fmtChips(Number(v)), state.players.find((p) => `p${p.id}` === key)?.displayName ?? key]}
            contentStyle={{ background: "var(--app-section)", border: "1px solid var(--app-separator)", borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: "var(--app-hint)" }}
          />
          <Legend
            formatter={(key) => <span style={{ color: "var(--app-text)", fontSize: 12 }}>{state.players.find((p) => `p${p.id}` === key)?.displayName}</span>}
            iconType="circle"
            iconSize={8}
          />
          {state.players.map((p) => (
            <Line
              key={p.id}
              dataKey={`p${p.id}`}
              type="stepAfter"
              stroke={playerColor(state, p.id)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
