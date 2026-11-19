"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client/api";
import { useBackButton } from "@/lib/client/telegram";
import { fmtBuyins, fmtDate, fmtSigned } from "@/lib/format";
import type { LeaderboardDTO } from "@/lib/types";
import { useMe, useToast } from "@/components/AppShell";
import { Button, Empty, inputCls, PageLoader, Section, Segmented, Sheet, Signed } from "@/components/ui";

export default function LeaderboardPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useMe();
  const [season, setSeason] = useState<string>("current");
  const { data, error, isLoading, mutate } = useSWR<LeaderboardDTO>(`/api/leaderboard/${publicId}?season=${season}`, fetcher);
  const [tab, setTab] = useState<"tournament" | "cash" | null>(null);
  const [seasonSheet, setSeasonSheet] = useState(false);
  const [seasonName, setSeasonName] = useState("");
  const back = useCallback(() => router.push("/leaderboard"), [router]);
  useBackButton(back);

  if (isLoading && !data) return <PageLoader />;
  if (error || !data) return <Empty icon="🤷" title="Лідерборд не знайдено">{error?.message}</Empty>;

  const currentTab = tab ?? (data.gamesCount.tournament >= data.gamesCount.cash ? "tournament" : "cash");
  const rows = currentTab === "tournament" ? data.tournament : data.cash;
  const isMember = me?.chats.some((c) => c.publicId === publicId);
  const activeSeason = data.seasons.find((s) => s.isActive);

  async function newSeason() {
    try {
      await api(`/api/chats/${publicId}/seasons`, "POST", { name: seasonName });
      setSeasonSheet(false);
      setSeasonName("");
      setSeason("current");
      toast("Новий сезон розпочато");
      mutate();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <div>
      <h1 className="font-display px-1 text-[1.6rem] font-bold leading-tight">{data.chat.title}</h1>
      <div className="mb-4 px-1 text-sm font-medium text-hint">
        {data.season ? `Сезон «${data.season.name}»` : "За весь час"} · {data.gamesCount.tournament} турнірів, {data.gamesCount.cash} кеш-ігор
      </div>

      <div className="mb-3 flex gap-2">
        <select className={`${inputCls} !py-2 text-sm`} value={season} onChange={(e) => setSeason(e.target.value)}>
          <option value="current">{activeSeason ? `Поточний: ${activeSeason.name}` : "Поточний (весь час)"}</option>
          <option value="all">Весь час</option>
          {data.seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({fmtDate(s.startsAt)}
              {s.endsAt ? ` – ${fmtDate(s.endsAt)}` : ""})
            </option>
          ))}
        </select>
        {isMember && (
          <Button variant="secondary" size="sm" className="!h-auto shrink-0" onClick={() => setSeasonSheet(true)}>
            Сезон…
          </Button>
        )}
      </div>

      <div className="mb-3">
        <Segmented
          value={currentTab}
          onChange={setTab}
          options={[
            { value: "tournament", label: "Турніри" },
            { value: "cash", label: "Кеш" },
          ]}
        />
      </div>

      <Section>
        {rows.length ? (
          rows.map((r, i) => (
            <Link
              key={r.key}
              href={`/profile/${encodeURIComponent(r.key)}?chat=${publicId}`}
              className="flex items-center gap-3 border-b border-sep px-4 py-3 transition-colors last:border-b-0 active:bg-fg/5"
            >
              {i < 3 ? (
                <span className="chip grid h-9 w-9 shrink-0 place-items-center font-display text-xs font-bold text-white" style={{ ["--chip" as string]: ["#d79a1e", "#8e9aa6", "#b06a3b"][i] }}>
                  <span className="relative z-10">{i + 1}</span>
                </span>
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fg/6 font-display text-xs font-bold text-hint">{i + 1}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.displayName}</span>
                <span className="block text-[12px] text-hint">
                  {r.games} ігор · {r.wins} перемог ·{" "}
                  {currentTab === "tournament" ? `сер. місце ${r.avgPlace}` : `сер. ${fmtBuyins(r.avgResult)}`}

                </span>
              </span>
              <span className="text-right">
                {currentTab === "tournament" ? (
                  <span className="block font-display text-xl font-bold tabular">{r.points}</span>
                ) : (
                  <>
                    <Signed value={r.netBuyins} className="block font-display text-lg font-bold">{fmtBuyins(r.netBuyins)}</Signed>
                    <Signed value={r.netChips} className="block text-[12px]">{fmtSigned(r.netChips)}</Signed>
                  </>
                )}
              </span>
            </Link>
          ))
        ) : (
          <Empty icon="📭" title="Ще немає результатів">Завершені ігри групи з’являться тут.</Empty>
        )}
      </Section>

      {data.recent.length > 0 && (
        <Section title="Останні ігри">
          {data.recent.map((g) => (
            <Link key={g.id} href={`/g/${g.id}/summary`} className="flex items-center justify-between border-b border-sep px-4 py-3 last:border-b-0 active:bg-fg/5">
              <span>
                <span className="block font-bold">{g.name}</span>
                <span className="block text-[12px] text-hint">{fmtDate(g.finishedAt)}{g.winner ? ` · 🥇 ${g.winner}` : ""}</span>
              </span>
              <span className="text-hint">›</span>
            </Link>
          ))}
        </Section>
      )}

      <Sheet open={seasonSheet} onClose={() => setSeasonSheet(false)} title="Сезони">
        <p className="mb-3 text-sm text-hint">Новий сезон обнуляє лідерборд: нові ігри групи рахуються в нього. Старі сезони залишаються в історії.</p>
        <div className="mb-3 flex gap-2">
          <input className={inputCls} placeholder="Назва, напр. Зима 2026" value={seasonName} maxLength={60} onChange={(e) => setSeasonName(e.target.value)} />
          <Button onClick={newSeason} disabled={!seasonName.trim()}>Почати</Button>
        </div>
        {activeSeason && (
          <Button
            variant="danger"
            className="mb-2 w-full"
            onClick={async () => {
              try {
                await api(`/api/chats/${publicId}/seasons`, "DELETE");
                setSeasonSheet(false);
                toast("Сезон завершено");
                mutate();
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            Завершити «{activeSeason.name}»
          </Button>
        )}
      </Sheet>
    </div>
  );
}
