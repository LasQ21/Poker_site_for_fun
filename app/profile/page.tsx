"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { fmtBuyins, pluralUk } from "@/lib/format";
import type { AchievementId } from "@/lib/game/stats";
import type { ProfileDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { IconChevron, IconSettings } from "@/components/icons";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, PageLoader, Section, Signed } from "@/components/ui";

const FormChart = dynamic(() => import("@/components/FormChart"), { ssr: false, loading: () => <div className="h-[200px]" /> });

const ACHIEVEMENTS: Record<AchievementId, { icon: string; title: string; text: string }> = {
  first_win: { icon: "🥇", title: "Перша перемога", text: "Виграти гру" },
  hot_streak: { icon: "🔥", title: "У плюсі", text: "5 ігор поспіль у плюсі або в призах" },
  regular: { icon: "🪑", title: "Завсідник", text: "Зіграти 10 ігор" },
  veteran: { icon: "🎖️", title: "Ветеран", text: "Зіграти 50 ігор" },
  shark: { icon: "🦈", title: "Акула", text: "+5 бай-інів за одну кеш-гру" },
  comeback: { icon: "🔁", title: "Камбек", text: "Виграти турнір після ребаю" },
  hat_trick: { icon: "🎩", title: "Хет-трик", text: "3 перемоги в турнірах" },
};

export default function ProfilePage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data, error, isLoading } = useSWR<ProfileDTO>(me?.user ? "/api/me/stats" : null, fetcher);

  if (meLoading) return <PageLoader />;
  if (!me?.user) return <LoginPanel />;
  if (isLoading || !data) return error ? <Empty icon="🤷" title="Не вдалося завантажити">{error.message}</Empty> : <PageLoader />;

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
          <Link href="/settings" aria-label="Налаштування" className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full text-hint">
            <IconSettings width={22} height={22} />
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Tile label={pluralUk(stats.games, "гра", "гри", "ігор")} value={stats.games} />
          <Tile label={pluralUk(stats.wins, "перемога", "перемоги", "перемог")} value={stats.wins} />
          <Tile label="разом" value={<Signed value={stats.netBuyins}>{fmtBuyins(stats.netBuyins)}</Signed>} />
        </div>
      </div>

      {stats.games === 0 ? (
        <Section>
          <Empty icon="🃏" title="Ще немає завершених ігор">
            Статистика з&apos;явиться після першої гри, де ви сиділи за столом під своїм Telegram.
          </Empty>
        </Section>
      ) : (
        <>
          <Section title="Форма">
            <div className="flex gap-1.5 px-4 pt-4">
              {stats.form.map((f) => (
                <Link
                  key={f.gameId}
                  href={`/g/${f.gameId}/summary`}
                  title={f.type === "cash" ? fmtBuyins(f.netBuyins) : `${f.place}-е з ${f.entrants}`}
                  className={`grid h-9 flex-1 place-items-center rounded-xl text-[13px] font-bold tabular ${
                    f.place === 1 ? "bg-gold/25 text-gold" : f.good ? "bg-pos/15 text-pos" : "bg-neg/12 text-neg"
                  }`}
                >
                  {f.place === 1 ? "🏆" : f.type === "cash" ? (f.netBuyins > 0 ? "+" : "−") : f.place}
                </Link>
              ))}
            </div>
            <FormChart timeline={stats.timeline} />
            <div className="px-4 pb-3 text-[12px] text-hint">Сумарний результат у бай-інах після кожної гри. Ліворуч — найновіші ігри.</div>
          </Section>

          <div className="mb-5 grid grid-cols-2 gap-2">
            <Card title="Турніри" lines={[
              [`${stats.tournament.games}`, pluralUk(stats.tournament.games, "турнір", "турніри", "турнірів")],
              [`${stats.tournament.wins}`, "перемог"],
              [`${stats.tournament.points}`, "очок"],
              [stats.tournament.avgPlace == null ? "—" : String(stats.tournament.avgPlace).replace(".", ","), "сер. місце"],
              [stats.tournament.games ? `${stats.tournament.itm}/${stats.tournament.games}` : "—", "у призах (ITM)"],
            ]} />
            <Card title="Кеш" lines={[
              [`${stats.cash.games}`, pluralUk(stats.cash.games, "гра", "гри", "ігор")],
              [fmtBuyins(stats.cash.netBuyins), "результат"],
              [`${stats.cash.wins}`, "найкращих за столом"],
              [pct(stats.itmRate), "ігор у плюсі/призах"],
              [`${stats.bestStreak}`, "найдовша серія"],
            ]} />
          </div>

          {stats.best && (
            <Link href={`/g/${stats.best.gameId}/summary`} className="glass mb-5 flex items-center gap-3 rounded-[28px] px-4 py-3.5">
              <span className="text-2xl">⭐</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-hint">Найкраща гра</span>
                <span className="font-display block truncate font-bold">{stats.best.gameName}</span>
              </span>
              <span className="text-right text-sm font-bold">
                {stats.best.type === "cash" ? fmtBuyins(stats.best.netBuyins) : stats.best.place === 1 ? "🏆 1-е" : `${stats.best.place}-е`}
              </span>
              <IconChevron />
            </Link>
          )}
        </>
      )}

      <Section title="Досягнення">
        <div className="grid grid-cols-2 gap-2 p-3">
          {stats.achievements.map((a) => {
            const meta = ACHIEVEMENTS[a.id];
            return (
              <div key={a.id} className={`rounded-[22px] px-3 py-3 ${a.achieved ? "bg-gold/15" : "bg-fg/5 opacity-70"}`}>
                <div className={`text-2xl ${a.achieved ? "" : "grayscale"}`}>{meta.icon}</div>
                <div className="mt-1 text-sm font-bold">{meta.title}</div>
                <div className="text-[12px] text-hint">{meta.text}</div>
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
