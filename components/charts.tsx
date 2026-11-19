"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format";

const AXIS = { fill: "var(--app-hint)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--app-section)",
  border: "1px solid var(--app-separator)",
  borderRadius: 14,
  fontSize: 12,
  color: "var(--app-text)",
  boxShadow: "0 8px 24px -12px rgba(0,0,0,.35)",
};

export interface TrendPoint {
  gameId: string;
  name: string;
  t: number;
  /** Result of this game. */
  value: number;
  /** Running total after this game. */
  cum: number;
}

function TipBox({ title, sub, rows }: { title: string; sub: string; rows: [string, ReactNode][] }) {
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <div className="font-bold">{title}</div>
      <div className="mb-1 text-[11px] text-hint">{sub}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 tabular">
          <span className="text-hint">{k}</span>
          <span className="font-semibold">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Running total over games (one series, no legend; the section title names it). */
export function CumulativeChart({
  data,
  format,
  label,
  height = 200,
}: {
  data: TrendPoint[];
  format: (n: number) => string;
  label: string;
  height?: number;
}) {
  const rows = data.map((d, i) => ({ ...d, i: i + 1 }));
  return (
    <div className="px-1 pt-3" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 6, right: 14, bottom: 0, left: -6 }}>
          <CartesianGrid stroke="var(--app-separator)" vertical={false} />
          <XAxis dataKey="i" tick={AXIS} stroke="var(--app-separator)" tickLine={false} allowDecimals={false} minTickGap={16} />
          <YAxis tick={AXIS} stroke="var(--app-separator)" tickLine={false} axisLine={false} width={44} tickFormatter={(v) => format(Number(v))} />
          <ReferenceLine y={0} stroke="var(--app-hint)" strokeOpacity={0.5} />
          <Tooltip
            cursor={{ stroke: "var(--app-hint)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload;
              if (!p) return null;
              return (
                <TipBox
                  title={p.name}
                  sub={`Гра ${p.i} · ${fmtDate(new Date(p.t))}`}
                  rows={[
                    ["За гру", format(p.value)],
                    [label, format(p.cum)],
                  ]}
                />
              );
            }}
          />
          <Line
            dataKey="cum"
            type="linear"
            stroke="var(--app-link)"
            strokeWidth={2}
            dot={rows.length <= 24 ? { r: 3.5, strokeWidth: 2, fill: "var(--app-section)" } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--app-section)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Result of each game as a bar: green above zero, red below (polarity, not identity). */
export function PerGameBars({
  data,
  format,
  height = 170,
  polarity = true,
}: {
  data: TrendPoint[];
  format: (n: number) => string;
  height?: number;
  polarity?: boolean;
}) {
  const rows = data.map((d, i) => ({ ...d, i: i + 1 }));
  return (
    <div className="px-1 pt-3" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 14, bottom: 0, left: -6 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--app-separator)" vertical={false} />
          <XAxis dataKey="i" tick={AXIS} stroke="var(--app-separator)" tickLine={false} minTickGap={10} />
          <YAxis tick={AXIS} stroke="var(--app-separator)" tickLine={false} axisLine={false} width={44} tickFormatter={(v) => format(Number(v))} />
          <ReferenceLine y={0} stroke="var(--app-hint)" strokeOpacity={0.5} />
          <Tooltip
            cursor={{ fill: "var(--app-text)", fillOpacity: 0.05 }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload;
              if (!p) return null;
              return <TipBox title={p.name} sub={`Гра ${p.i} · ${fmtDate(new Date(p.t))}`} rows={[["Результат", format(p.value)]]} />;
            }}
          />
          <Bar dataKey="value" maxBarSize={28} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell
                key={r.gameId}
                fill={!polarity ? "var(--app-link)" : r.value >= 0 ? "var(--positive)" : "var(--negative)"}
                // @ts-expect-error recharts accepts per-cell radius
                radius={r.value >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
