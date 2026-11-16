"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import type { GameListItemDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { GameList } from "@/components/GameList";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, PageLoader, Section } from "@/components/ui";

export default function HistoryPage() {
  const { data: me, isLoading } = useMe();
  const { data } = useSWR<{ games: GameListItemDTO[] }>(me?.user ? "/api/history" : null, fetcher);
  if (isLoading) return <PageLoader />;
  if (!me?.user) return <LoginPanel />;
  if (!data) return <PageLoader />;

  const byMonth = new Map<string, GameListItemDTO[]>();
  for (const g of data.games) {
    const key = new Date(g.finishedAt ?? g.createdAt).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
    byMonth.set(key, [...(byMonth.get(key) ?? []), g]);
  }

  return (
    <div>
      <h1 className="mb-3 px-1 text-2xl font-bold">Історія</h1>
      {data.games.length === 0 ? (
        <Section>
          <Empty icon="🗂" title="Ще немає завершених ігор" />
        </Section>
      ) : (
        [...byMonth.entries()].map(([month, games]) => (
          <Section key={month} title={month}>
            <GameList games={games} summaryLinks />
          </Section>
        ))
      )}
      {data.games.length > 0 && <p className="px-4 text-[13px] text-hint">CSV кожної гри — на сторінці підсумку.</p>}
    </div>
  );
}
