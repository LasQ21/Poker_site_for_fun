"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useGame } from "@/lib/client/useGame";
import { openExternal, useBackButton } from "@/lib/client/telegram";
import { fmtBuyins, fmtChips, fmtDateTime, fmtSigned } from "@/lib/format";
import { playerColor } from "@/components/StackTable";
import { Badge, Button, Empty, PageLoader, Section, Signed } from "@/components/ui";

const StackChart = dynamic(() => import("@/components/StackChart"), { ssr: false, loading: () => <div className="h-[260px]" /> });
const MEDALS = ["🥇", "🥈", "🥉"];

export default function SummaryPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { data: state, error, isLoading } = useGame(gameId);
  const back = useCallback(() => router.push(`/g/${gameId}`), [router, gameId]);
  useBackButton(back);

  if (isLoading) return <PageLoader />;
  if (error || !state) return <Empty icon="🤷" title="Гру не знайдено">{error?.message}</Empty>;
  const { game, results } = state;
  const cash = game.type === "cash";
  const winner = results[0];
  const rebuys = state.buyins.filter((b) => b.kind !== "buyin").length;
  const durationMin = Math.round(
    ((game.finishedAt ? new Date(game.finishedAt).getTime() : state.serverNow) - new Date(game.createdAt).getTime()) / 60_000,
  );

  return (
    <div>
      <div className="mb-4 rounded-3xl bg-gradient-to-br from-felt to-felt-2 px-5 py-5 text-white">
        <div className="flex items-center gap-2 text-[13px] text-white/75">
          {cash ? "💵 Кеш" : "🏆 Турнір"} · {fmtDateTime(game.createdAt)}
          {game.status === "active" && <Badge tone="pos">ще триває</Badge>}
        </div>
        <h1 className="mt-1 text-2xl font-bold">{game.name}</h1>
        {winner && (
          <div className="mt-3 text-lg">
            🏆 <b>{winner.displayName}</b>
            <span className="text-white/80"> — {cash ? `${fmtSigned(winner.netChips)} (${fmtBuyins(winner.netBuyins)})` : `${winner.points} очк.`}</span>
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="гравців" value={state.players.length} />
          <Stat label="ребаїв/аддонів" value={rebuys} />
          <Stat label="хвилин" value={durationMin} />
        </div>
      </div>

      <Section title="Результати">
        {results.map((r) => (
          <div key={r.playerId} className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-b-0">
            <span className="w-7 text-center text-lg">{MEDALS[r.place - 1] ?? <span className="text-sm text-hint">{r.place}</span>}</span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: playerColor(state, r.playerId) }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{r.displayName}</span>
              <span className="block text-[12px] text-hint tabular">
                {r.buyinCount} БІ · {fmtChips(r.buyinChips)} → {fmtChips(r.finalChips)}
              </span>
            </span>
            <span className="text-right">
              {cash ? (
                <>
                  <Signed value={r.netChips} className="block font-bold">{fmtSigned(r.netChips)}</Signed>
                  <Signed value={r.netBuyins} className="block text-[12px]">{fmtBuyins(r.netBuyins)}</Signed>
                </>
              ) : (
                <>
                  <span className="block font-bold tabular">{r.points} очк.</span>
                  <span className="block text-[12px] text-hint">{r.place}-е місце</span>
                </>
              )}
            </span>
          </div>
        ))}
      </Section>
      {cash && state.check.diff !== 0 && (
        <p className="-mt-2 mb-4 px-4 text-[13px] text-neg">⚠️ Фішки не сходяться: {fmtSigned(state.check.diff)}</p>
      )}

      <Section title="Стеки в часі">
        <StackChart state={state} />
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => openExternal(`${window.location.origin}/api/games/${game.id}/export.csv`)}>
          ⬇️ CSV
        </Button>
        <Link href={`/g/${game.id}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-button/12 font-semibold text-link">
          До гри
        </Link>
        {state.chat && (
          <Link href={`/leaderboard/${state.chat.publicId}`} className="col-span-2 inline-flex h-11 items-center justify-center rounded-xl bg-button font-semibold text-button-fg">
            🏆 Лідерборд «{state.chat.title}»
          </Link>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/12 py-2">
      <div className="text-xl font-bold tabular">{value}</div>
      <div className="text-[11px] text-white/75">{label}</div>
    </div>
  );
}
