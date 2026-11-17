"use client";

import { useT } from "@/lib/i18n/client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { GameListItemDTO } from "@/lib/types";
import { IconChevron } from "./icons";
import { Badge, Row } from "./ui";

export function GameList({ games, summaryLinks }: { games: GameListItemDTO[]; summaryLinks?: boolean }) {
  const t = useT();
  return (
    <>
      {games.map((g) => (
        <Row key={g.id} href={summaryLinks || g.status === "finished" ? `/g/${g.id}/summary` : `/g/${g.id}`}>
          <span
            className="chip grid h-11 w-11 shrink-0 place-items-center text-base"
            style={{ ["--chip" as string]: g.type === "cash" ? "#0f8a5f" : "#2f6fdb" }}
          >
            <span className="relative z-10">{g.type === "cash" ? "$" : "★"}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold">{g.name}</span>
              {g.status === "active" && <Badge tone="pos">{t("common.live")}</Badge>}
              {g.isHost && <Badge>{t("common.host")}</Badge>}
            </div>
            <div className="truncate text-[13px] font-medium text-hint">
              {g.status === "finished" ? fmtDate(g.finishedAt) : fmtDateTime(g.createdAt)}, {t("common.players", { n: g.playerCount })}
              {g.chatTitle ? t("list.inChat", { chat: g.chatTitle }) : ""}
            </div>
            {g.winner && <div className="truncate text-[13px] font-semibold text-gold">🏆 {g.winner}</div>}
          </div>
          <IconChevron className="shrink-0 text-hint/70" />
        </Row>
      ))}
    </>
  );
}
