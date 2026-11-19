"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtBuyins, fmtDate, fmtSigned, pluralUk } from "@/lib/format";
import type { LeaderboardDTO, LeaderboardEntryDTO } from "@/lib/types";
import { Empty, Section, Segmented, Signed } from "./ui";

const PODIUM = ["#d79a1e", "#8e9aa6", "#b06a3b"];

function profileLink(r: LeaderboardEntryDTO, chatPublicId: string | null) {
  if (chatPublicId) return `/profile/${encodeURIComponent(r.key)}?chat=${chatPublicId}`;
  return r.userId != null ? `/profile/${encodeURIComponent(r.key)}` : null;
}

/** Tournament / cash standings with Telegram avatars and @usernames; rows open player profiles. */
export function LeaderboardBoard({ data, emptyText }: { data: LeaderboardDTO; emptyText: string }) {
  const [tab, setTab] = useState<"tournament" | "cash" | null>(null);
  const current = tab ?? (data.gamesCount.tournament >= data.gamesCount.cash ? "tournament" : "cash");
  const rows = current === "tournament" ? data.tournament : data.cash;
  const chatId = data.chat?.publicId ?? null;

  return (
    <>
      <div className="mb-3">
        <Segmented
          value={current}
          onChange={setTab}
          options={[
            { value: "tournament", label: `Турніри · ${data.gamesCount.tournament}` },
            { value: "cash", label: `Кеш · ${data.gamesCount.cash}` },
          ]}
        />
      </div>

      <Section>
        {rows.length ? (
          rows.map((r, i) => {
            const href = profileLink(r, chatId);
            const body = (
              <>
                <span className="relative shrink-0">
                  {r.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span
                      className="chip grid h-10 w-10 place-items-center font-display text-xs font-bold text-white"
                      style={{ ["--chip" as string]: i < 3 ? PODIUM[i] : "var(--felt)" }}
                    >
                      <span className="relative z-10">{r.displayName.slice(0, 1).toUpperCase()}</span>
                    </span>
                  )}
                  <span
                    className={`absolute -bottom-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 font-display text-[10px] font-bold ring-2 ring-[var(--app-section)] ${
                      i < 3 ? "text-white" : "text-fg/80"
                    }`}
                    style={{ background: i < 3 ? PODIUM[i] : "var(--app-section)" }}
                  >
                    {i + 1}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="truncate font-semibold">{r.displayName}</span>
                    {r.username && <span className="truncate text-[12px] font-medium text-hint">@{r.username}</span>}
                  </span>
                  <span className="block text-[12px] text-hint">
                    {r.games} {pluralUk(r.games, "гра", "гри", "ігор")} · {r.wins} 🥇 ·{" "}
                    {current === "tournament" ? `сер. місце ${r.avgPlace}` : `сер. ${fmtBuyins(r.avgResult)}`}
                  </span>
                </span>
                <span className="text-right">
                  {current === "tournament" ? (
                    <>
                      <span className="block font-display text-xl font-bold tabular">{r.points}</span>
                      <span className="block text-[11px] font-semibold text-hint">{pluralUk(r.points, "очко", "очки", "очок")}</span>
                    </>
                  ) : (
                    <>
                      <Signed value={r.netBuyins} className="block font-display text-lg font-bold">
                        {fmtBuyins(r.netBuyins)}
                      </Signed>
                      <Signed value={r.netChips} className="block text-[12px]">
                        {fmtSigned(r.netChips)}
                      </Signed>
                    </>
                  )}
                </span>
              </>
            );
            const cls = "flex items-center gap-3 border-b border-sep px-4 py-3 last:border-b-0";
            return href ? (
              <Link key={r.key} href={href} className={`${cls} transition-colors active:bg-fg/5`}>
                {body}
              </Link>
            ) : (
              <div key={r.key} className={cls}>
                {body}
              </div>
            );
          })
        ) : (
          <Empty icon="📭" title="Ще немає результатів">
            {emptyText}
          </Empty>
        )}
      </Section>

      {data.recent.length > 0 && (
        <Section title="Останні ігри">
          {data.recent.map((g) => (
            <Link key={g.id} href={`/g/${g.id}/summary`} className="flex items-center justify-between border-b border-sep px-4 py-3 last:border-b-0 active:bg-fg/5">
              <span>
                <span className="block font-bold">{g.name}</span>
                <span className="block text-[12px] text-hint">
                  {fmtDate(g.finishedAt)}
                  {g.winner ? ` · 🥇 ${g.winner}` : ""}
                </span>
              </span>
              <span className="text-hint">›</span>
            </Link>
          ))}
        </Section>
      )}
    </>
  );
}
