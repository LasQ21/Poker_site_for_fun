"use client";

import { useT } from "@/lib/i18n/client";
import dynamic from "next/dynamic";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { fmtBuyins, fmtDecimal } from "@/lib/format";
import type { AchievementId } from "@/lib/game/stats";
import type { ProfileDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { IconChevron, IconSettings } from "@/components/icons";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, PageSkeleton, Section, Signed } from "@/components/ui";

const FormChart = dynamic(() => import("@/components/FormChart"), { ssr: false, loading: () => <div className="h-[200px]" /> });

const ACHIEVEMENT_ICONS: Record<AchievementId, string> = {
  first_win: "🥇",
  hot_streak: "🔥",
  regular: "🪑",
  veteran: "🎖️",
  shark: "🦈",
  comeback: "🔁",
  hat_trick: "🎩",
};

export default function ProfilePage() {
  const { data: me, isLoading: meLoading } = useMe();
  const t = useT();
  const { data, error, isLoading } = useSWR<ProfileDTO>(me?.user ? "/api/me/stats" : null, fetcher);

  if (meLoading) return <PageSkeleton variant="list" />;
  if (!me?.user) return <LoginPanel />;
  if (isLoading || !data) return error ? <Empty icon="🤷" title={t("profile.loadFailed")}>{error.message}</Empty> : <PageSkeleton variant="list" />;

  const { user, stats } = data;
  const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

  return (
    <div>
      <div className="glass mb-5 rounded-[34px] px-5 py-5">
        <div className="flex items-center gap-4">
          {user.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoUrl} alt="" className="h-16 w-16 rounded-full" />
          ) : (
            <span className="chip grid h-16 w-16 place-items-center font-display text-2xl font-bold text-white" style={{ ["--chip" as string]: "var(--felt)" }}>
              <span className="relative z-10">{user.firstName.slice(0, 1)}</span>
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-[1.5rem] font-bold leading-tight">
              {[user.firstName, user.lastName].filter(Boolean).join(" ")}
            </h1>
            {user.username && <div className="text-sm font-semibold text-hint">@{user.username}</div>}
          </div>
          <Link href="/settings" aria-label={t("nav.settings")} className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full text-hint">
            <IconSettings width={22} height={22} />
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Tile label={t("label.games", { n: stats.games })} value={stats.games} />
          <Tile label={t("label.wins", { n: stats.wins })} value={stats.wins} />
          <Tile label={t("profile.total")} value={<Signed value={stats.netBuyins}>{fmtBuyins(stats.netBuyins)}</Signed>} />
        </div>
      </div>

      {stats.games === 0 ? (
        <Section>
          <Empty icon="🃏" title={t("profile.noGames")}>
            {t("profile.noGamesText")}
          </Empty>
        </Section>
      ) : (
        <>
          <Section title={t("profile.form")}>
            <div className="flex gap-1.5 px-4 pt-4">
              {stats.form.map((f) => (
                <Link
                  key={f.gameId}
                  href={`/g/${f.gameId}/summary`}
                  title={f.type === "cash" ? fmtBuyins(f.netBuyins) : t("profile.placeOf", { n: f.place, of: f.entrants })}
                  className={`grid h-9 flex-1 place-items-center rounded-xl text-[13px] font-bold tabular ${
                    f.place === 1 ? "bg-gold/25 text-gold" : f.good ? "bg-pos/15 text-pos" : "bg-neg/12 text-neg"
                  }`}
                >
                  {f.place === 1 ? "🏆" : f.type === "cash" ? (f.netBuyins > 0 ? "+" : "−") : f.place}
                </Link>
              ))}
            </div>
            <FormChart timeline={stats.timeline} />
            <div className="px-4 pb-3 text-[12px] text-hint">{t("profile.formHint")}</div>
          </Section>

          <div className="mb-5 grid grid-cols-2 gap-2">
            <Card
              title={t("profile.tournaments")}
              lines={[
                [`${stats.tournament.games}`, t("label.tournaments", { n: stats.tournament.games })],
                [`${stats.tournament.wins}`, t("profile.wins")],
                [`${stats.tournament.points}`, t("profile.points")],
                [stats.tournament.avgPlace == null ? "—" : fmtDecimal(stats.tournament.avgPlace), t("profile.avgPlace")],
                [stats.tournament.games ? `${stats.tournament.itm}/${stats.tournament.games}` : "—", t("profile.itm")],
              ]}
            />
            <Card
              title={t("profile.cash")}
              lines={[
                [`${stats.cash.games}`, t("label.games", { n: stats.cash.games })],
                [fmtBuyins(stats.cash.netBuyins), t("profile.result")],
                [`${stats.cash.wins}`, t("profile.bestAtTable")],
                [pct(stats.itmRate), t("profile.goodRate")],
                [`${stats.bestStreak}`, t("profile.bestStreak")],
              ]}
            />
          </div>

          {stats.best && (
            <Link href={`/g/${stats.best.gameId}/summary`} className="glass mb-5 flex items-center gap-3 rounded-[28px] px-4 py-3.5">
              <span className="text-2xl">⭐</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-hint">{t("profile.bestGame")}</span>
                <span className="font-display block truncate font-bold">{stats.best.gameName}</span>
              </span>
              <span className="text-right text-sm font-bold">
                {stats.best.type === "cash" ? fmtBuyins(stats.best.netBuyins) : `${stats.best.place === 1 ? "🏆 " : ""}${t("common.place", { n: stats.best.place })}`}
              </span>
              <IconChevron />
            </Link>
          )}
        </>
      )}

      <Section title={t("profile.achievements")}>
        <div className="grid grid-cols-2 gap-2 p-3">
          {stats.achievements.map((a) => {

            return (
              <div key={a.id} className={`rounded-[22px] px-3 py-3 ${a.achieved ? "bg-gold/15" : "bg-fg/5 opacity-70"}`}>
                <div className={`text-2xl ${a.achieved ? "" : "grayscale"}`}>{ACHIEVEMENT_ICONS[a.id]}</div>
                <div className="mt-1 text-sm font-bold">{t(`ach.${a.id}.title`)}</div>
                <div className="text-[12px] text-hint">{t(`ach.${a.id}.text`)}</div>
                {a.progress && !a.achieved && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/10" role="progressbar" aria-valuenow={a.progress.current} aria-valuemax={a.progress.target}>
                    <div className="h-full rounded-full bg-link" style={{ width: `${(a.progress.current / a.progress.target) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[20px] bg-fg/6 py-2.5">
      <div className="font-display text-xl font-bold tabular">{value}</div>
      <div className="text-[11px] font-semibold text-hint">{label}</div>
    </div>
  );
}

function Card({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <div className="glass rounded-[26px] px-4 py-3.5">
      <div className="mb-2 font-display font-bold">{title}</div>
      {lines.map(([v, l]) => (
        <div key={l} className="flex items-baseline justify-between gap-2 py-0.5 text-sm">
          <span className="text-hint">{l}</span>
          <span className="font-bold tabular">{v}</span>
        </div>
      ))}
    </div>
  );
}
