"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface HBarItem {
  key: string;
  label: ReactNode;
  value: number;
  display: string;
  href?: string | null;
  color?: string;
}

/**
 * Horizontal bars in plain HTML: one row per player, value labelled at the end.
 * With `diverging`, bars grow left/right from a centre line (negative / positive results).
 */
export function HBars({ items, diverging }: { items: HBarItem[]; diverging?: boolean }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="space-y-2.5 px-4 py-4">
      {items.map((it) => {
        const pct = (Math.abs(it.value) / max) * (diverging ? 50 : 100);
        const color = it.color ?? (diverging ? (it.value >= 0 ? "var(--positive)" : "var(--negative)") : "var(--app-link)");
        const label = it.href ? (
          <Link href={it.href} className="truncate font-semibold underline-offset-2 hover:underline">
            {it.label}
          </Link>
        ) : (
          <span className="truncate font-semibold">{it.label}</span>
        );
        return (
          <div key={it.key} title={`${typeof it.label === "string" ? it.label : ""}: ${it.display}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              {label}
              <span className="shrink-0 font-bold tabular">{it.display}</span>
            </div>
            <div className="relative h-2.5 rounded-full bg-fg/7">
              {diverging && <span className="absolute inset-y-[-3px] left-1/2 w-px bg-fg/25" />}
              <span
                className="absolute inset-y-0 rounded-full"
                style={{
                  width: `${Math.max(pct, it.value === 0 ? 0 : 1.5)}%`,
                  background: color,
                  left: diverging ? (it.value >= 0 ? "50%" : `${50 - pct}%`) : 0,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
