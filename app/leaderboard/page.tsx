"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import type { LeaderboardDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { LeaderboardBoard } from "@/components/LeaderboardBoard";
import { LoginPanel } from "@/components/LoginPanel";
import { PageLoader, Row, Section } from "@/components/ui";

/** Overall leaderboard of everyone the viewer plays with (Telegram accounts), plus per-group boards. */
export default function LeaderboardIndex() {
  const { data: me, isLoading } = useMe();
  const { data, error } = useSWR<LeaderboardDTO>(me?.user ? "/api/leaderboard/me" : null, fetcher);

  if (isLoading) return <PageLoader />;
  if (!me?.user) return <LoginPanel />;

  return (
    <div>
      <h1 className="font-display px-1 text-[1.6rem] font-bold leading-tight">Рейтинг</h1>
      <div className="mb-4 px-1 text-sm font-medium text-hint">
        Усі ваші ігри{data ? ` · ${data.gamesCount.tournament} турнірів, ${data.gamesCount.cash} кеш-ігор` : ""}
      </div>

      {error ? (
        <p className="mb-4 px-2 text-sm text-neg">{error.message}</p>
      ) : !data ? (
        <PageLoader />
      ) : (
        <LeaderboardBoard data={data} emptyText="Завершіть першу гру — і тут з'явиться рейтинг вашої компанії." />
      )}

      {me.chats.length > 0 && (
        <Section title="Рейтинги груп і сезони">
          {me.chats.map((c) => (
            <Row key={c.id} href={`/leaderboard/${c.publicId}`}>
              <span className="chip h-10 w-10 shrink-0" style={{ ["--chip" as string]: "var(--felt)" }} />
              <span className="flex-1 font-bold">{c.title}</span>
              <span className="text-hint">›</span>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}
