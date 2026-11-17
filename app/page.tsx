"use client";

import { useT } from "@/lib/i18n/client";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import type { GameListItemDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { ChipStack } from "@/components/ChipStack";
import { GameList } from "@/components/GameList";
import { IconChevron, IconPlus } from "@/components/icons";
import { JoinByCode } from "@/components/JoinByCode";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, LinkButton, PageSkeleton, Section } from "@/components/ui";

export default function HomePage() {
  const { data: me, isLoading } = useMe();
  const t = useT();
  const { data } = useSWR<{ games: GameListItemDTO[] }>(me?.user ? "/api/games" : null, fetcher, { refreshInterval: 10_000 });

  if (isLoading) return <PageSkeleton variant="home" />;

  const active = data?.games.filter((g) => g.status === "active") ?? [];
  const recent = data?.games.filter((g) => g.status === "finished").slice(0, 5) ?? [];
  const live = active[0];

  return (
    <div>
      <div className="glass relative mb-5 overflow-hidden rounded-[34px] px-5 pb-5 pt-6">
        <ChipStack className="absolute -right-2 top-3 opacity-95" />
        <h1 className="font-display max-w-[15rem] text-[1.7rem] font-bold leading-[1.1]">
          {me?.user ? t("home.greeting", { name: me.user.firstName }) : t("home.title")}
        </h1>
        <p className="mt-2 max-w-[17rem] text-[15px] font-medium text-hint">
          {t("home.subtitle")}
        </p>
        {me?.user && (
          <LinkButton href="/new" variant="primary" className="mt-5 w-full">
            <IconPlus width={20} height={20} /> {t("home.newGame")}
          </LinkButton>
        )}
      </div>

      {!me?.user ? (
        <LoginPanel />
      ) : !data ? (
        <PageSkeleton variant="list" />
      ) : (
        <>
          {live && (
            <Link href={`/g/${live.id}`} className="glass-tint mb-5 flex items-center gap-3 rounded-[28px] px-4 py-4 active:scale-[0.99] transition">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold opacity-80">{t("home.live")}</span>
                <span className="font-display block truncate text-lg font-bold">{live.name}</span>
              </span>
              <span className="text-sm font-bold opacity-90">
                {t("common.players", { n: live.playerCount })}
              </span>
              <IconChevron />
            </Link>
          )}
          <JoinByCode />
          {active.length > 1 && (
            <Section title={t("home.otherActive")}>
              <GameList games={active.slice(1)} />
            </Section>
          )}
          {!live && (
            <Section>
              <Empty icon="🎲" title={t("home.noActive")}>
                {t("home.noActiveText")}
              </Empty>
            </Section>
          )}
          {recent.length > 0 && (
            <Section
              title={t("home.recent")}
              action={
                <Link href="/history" className="text-sm font-bold text-link">
                  {t("home.all")}
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
