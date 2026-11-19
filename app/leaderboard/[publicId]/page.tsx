"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client/api";
import { useBackButton } from "@/lib/client/telegram";
import { fmtDate } from "@/lib/format";
import type { LeaderboardDTO } from "@/lib/types";
import { useMe, useToast } from "@/components/AppShell";
import { LeaderboardBoard } from "@/components/LeaderboardBoard";
import { Button, Empty, inputCls, PageLoader, Sheet } from "@/components/ui";

export default function LeaderboardPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useMe();
  const [season, setSeason] = useState<string>("current");
  const { data, error, isLoading, mutate } = useSWR<LeaderboardDTO>(`/api/leaderboard/${publicId}?season=${season}`, fetcher);
  const [seasonSheet, setSeasonSheet] = useState(false);
  const [seasonName, setSeasonName] = useState("");
  const back = useCallback(() => router.push("/leaderboard"), [router]);
  useBackButton(back);

  if (isLoading && !data) return <PageLoader />;
  if (error || !data) return <Empty icon="🤷" title="Лідерборд не знайдено">{error?.message}</Empty>;

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
      <h1 className="font-display px-1 text-[1.6rem] font-bold leading-tight">{data.chat?.title}</h1>
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

      <LeaderboardBoard data={data} emptyText="Завершені ігри групи з’являться тут." />

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
