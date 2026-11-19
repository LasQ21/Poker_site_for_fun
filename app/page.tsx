"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { pluralUk } from "@/lib/format";
import type { GameListItemDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { ChipStack } from "@/components/ChipStack";
import { GameList } from "@/components/GameList";
import { IconChevron, IconPlus } from "@/components/icons";
import { JoinByCode } from "@/components/JoinByCode";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, LinkButton, PageLoader, Section } from "@/components/ui";

export default function HomePage() {
  const { data: me, isLoading } = useMe();
  const { data } = useSWR<{ games: GameListItemDTO[] }>(me?.user ? "/api/games" : null, fetcher, { refreshInterval: 10_000 });

  if (isLoading) return <PageLoader />;

  const active = data?.games.filter((g) => g.status === "active") ?? [];
  const recent = data?.games.filter((g) => g.status === "finished").slice(0, 5) ?? [];
  const live = active[0];

  return (
    <div>
      <div className="glass relative mb-5 overflow-hidden rounded-[34px] px-5 pb-5 pt-6">
        <ChipStack className="absolute -right-2 top-3 opacity-95" />
        <h1 className="font-display max-w-[15rem] text-[1.7rem] font-bold leading-[1.1]">
          {me?.user ? `${me.user.firstName}, сідаємо?` : "Покер з друзями, без грошей"}
        </h1>
        <p className="mt-2 max-w-[17rem] text-[15px] font-medium text-hint">
          Бай-іни, таймер блайндів і ходу, а після гри — статистика й графіки кожного.
        </p>
        {me?.user && (
          <LinkButton href="/new" variant="primary" className="mt-5 w-full">
            <IconPlus width={20} height={20} /> Нова гра
          </LinkButton>
        )}
      </div>

      {!me?.user ? (
        <LoginPanel />
      ) : !data ? (
        <PageLoader />
      ) : (
        <>
          {live && (
            <Link href={`/g/${live.id}`} className="glass-tint mb-5 flex items-center gap-3 rounded-[28px] px-4 py-4 active:scale-[0.99] transition">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold opacity-80">Гра триває</span>
                <span className="font-display block truncate text-lg font-bold">{live.name}</span>
              </span>
              <span className="text-sm font-bold opacity-90">
                {live.playerCount} {pluralUk(live.playerCount, "гравець", "гравці", "гравців")}
              </span>
              <IconChevron />
            </Link>
          )}
          <JoinByCode />
          {active.length > 1 && (
            <Section title="Інші активні ігри">
              <GameList games={active.slice(1)} />
            </Section>
          )}
          {!live && (
            <Section>
              <Empty icon="🎲" title="Активних ігор немає">
                Створіть гру тут або напишіть /newgame у груповому чаті з ботом.
              </Empty>
            </Section>
          )}
          {recent.length > 0 && (
            <Section
              title="Нещодавні"
              action={
                <Link href="/history" className="text-sm font-bold text-link">
                  Усі
                </Link>
              }
            >
              <GameList games={recent} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
