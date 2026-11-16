"use client";

import { fmtDate, fmtDateTime, pluralUk } from "@/lib/format";
import type { GameListItemDTO } from "@/lib/types";
import { Badge, Row } from "./ui";

export function GameList({ games, summaryLinks }: { games: GameListItemDTO[]; summaryLinks?: boolean }) {
  return (
    <>
      {games.map((g) => (
        <Row key={g.id} href={summaryLinks || g.status === "finished" ? `/g/${g.id}/summary` : `/g/${g.id}`}>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${g.type === "cash" ? "bg-pos/15" : "bg-button/15"}`}>
            {g.type === "cash" ? "💵" : "🏆"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{g.name}</span>
              {g.status === "active" && <Badge tone="pos">триває</Badge>}
              {g.isHost && <Badge>хост</Badge>}
            </div>
            <div className="truncate text-[13px] text-hint">
              {g.status === "finished" ? fmtDate(g.finishedAt) : fmtDateTime(g.createdAt)} · {g.playerCount}{" "}
              {pluralUk(g.playerCount, "гравець", "гравці", "гравців")}
              {g.chatTitle ? ` · ${g.chatTitle}` : ""}
              {g.winner ? ` · 🥇 ${g.winner}` : ""}
            </div>
          </div>
          <span className="text-hint">›</span>
        </Row>
      ))}
    </>
  );
}
