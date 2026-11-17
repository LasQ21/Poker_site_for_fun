"use client";

import { useT } from "@/lib/i18n/client";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { fmtMonth } from "@/lib/format";
import type { GameListItemDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { GameList } from "@/components/GameList";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, PageSkeleton, Section } from "@/components/ui";

export default function HistoryPage() {
  const { data: me, isLoading } = useMe();
  const t = useT();
  const { data } = useSWR<{ games: GameListItemDTO[] }>(me?.user ? "/api/history" : null, fetcher);
  if (isLoading) return <PageSkeleton variant="list" />;
  if (!me?.user) return <LoginPanel />;
  if (!data) return <PageSkeleton variant="list" />;

  const byMonth = new Map<string, GameListItemDTO[]>();
  for (const g of data.games) {
    const key = fmtMonth(g.finishedAt ?? g.createdAt);
    byMonth.set(key, [...(byMonth.get(key) ?? []), g]);
  }

  return (
    <div>
      <h1 className="font-display mb-4 px-1 text-[1.6rem] font-bold">{t("history.title")}</h1>
      {data.games.length === 0 ? (
        <Section>
          <Empty icon="🗂" title={t("history.empty")} />
        </Section>
      ) : (
        [...byMonth.entries()].map(([month, games]) => (
          <Section key={month} title={month}>
            <GameList games={games} summaryLinks />
          </Section>
        ))
      )}
      {data.games.length > 0 && <p className="px-4 text-[13px] text-hint">{t("history.csvHint")}</p>}
    </div>
  );
}
