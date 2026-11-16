"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import type { GameListItemDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { GameList } from "@/components/GameList";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, LinkButton, PageLoader, Section } from "@/components/ui";

export default function HomePage() {
  const { data: me, isLoading } = useMe();
  const { data } = useSWR<{ games: GameListItemDTO[] }>(me?.user ? "/api/games" : null, fetcher, { refreshInterval: 10_000 });

  if (isLoading) return <PageLoader />;

  const active = data?.games.filter((g) => g.status === "active") ?? [];
  const recent = data?.games.filter((g) => g.status === "finished").slice(0, 5) ?? [];

  return (
    <div>
      <div className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-felt to-felt-2 px-5 py-6 text-white shadow-sm">
        <div className="text-[13px] font-medium uppercase tracking-widest text-white/70">Домашній покер</div>
        <h1 className="mt-1 text-2xl font-bold">{me?.user ? `Привіт, ${me.user.firstName}!` : "Poker Tracker"}</h1>
        <p className="mt-1 text-sm text-white/80">Стеки, бай-іни, таймер блайндів і лідерборд — без грошей, лише фішки та очки.</p>
        {me?.user && (
          <LinkButton href="/new" variant="primary" className="mt-4 w-full !bg-white !text-felt">
            ＋ Нова гра
          </LinkButton>
        )}
      </div>

      {!me?.user ? (
        <LoginPanel />
      ) : !data ? (
        <PageLoader />
      ) : (
        <>
          <Section title="Активні ігри">
            {active.length ? (
              <GameList games={active} />
            ) : (
              <Empty icon="🎲" title="Немає активних ігор">
                Створіть гру тут або напишіть /newgame у груповому чаті з ботом.
              </Empty>
            )}
          </Section>
          {recent.length > 0 && (
            <Section title="Нещодавні" action={<Link href="/history" className="text-sm text-link">Усі</Link>}>
              <GameList games={recent} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
