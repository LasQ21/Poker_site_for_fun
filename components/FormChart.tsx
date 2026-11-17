"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBuyins, fmtDate } from "@/lib/format";
import type { PlayerStats } from "@/lib/game/stats";

/** Cumulative result in buy-ins over the player's games. */
export default function FormChart({ timeline, height = 200 }: { timeline: PlayerStats["timeline"]; height?: number }) {
  if (timeline.length < 2) {
    return <div className="px-4 py-8 text-center text-sm text-hint">Графік з&apos;явиться після двох завершених ігор.</div>;
  }
  const data = [{ i: 0, t: timeline[0].t, total: 0, net: 0 }, ...timeline.map((p, i) => ({ i: i + 1, ...p }))];
  const up = timeline[timeline.length - 1].total >= 0;
  const color = up ? "var(--positive)" : "var(--negative)";
  return (
    <div className="px-1 pt-3" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="form-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--app-separator)" vertical={false} />
          <XAxis dataKey="i" tick={{ fill: "var(--app-hint)", fontSize: 11 }} stroke="var(--app-separator)" allowDecimals={false} />
          <YAxis tick={{ fill: "var(--app-hint)", fontSize: 11 }} stroke="var(--app-separator)" width={40} />
          <ReferenceLine y={0} stroke="var(--app-hint)" strokeDasharray="3 3" />
          <Tooltip
            labelFormatter={(_, p) => (p?.[0]?.payload?.i ? `${p[0].payload.i}. ${fmtDate(new Date(p[0].payload.t))}` : "")}
            formatter={(v) => [fmtBuyins(Number(v)), "разом"]}
            contentStyle={{ background: "var(--app-section)", border: "1px solid var(--app-separator)", borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: "var(--app-hint)" }}
          />
          <Area type="monotone" dataKey="total" stroke={color} strokeWidth={2.2} fill="url(#form-fill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
