"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { fmtBuyins, fmtDate, fmtSigned, pluralUk } from "@/lib/format";
import type { ProfileDTO } from "@/lib/types";
import { HBars } from "./HBars";
import { Empty, Section, Segmented, Signed } from "./ui";

const chartLoading = () => <div className="h-[200px]" />;
const CumulativeChart = dynamic(() => import("./charts").then((m) => m.CumulativeChart), { ssr: false, loading: chartLoading });
const PerGameBars = dynamic(() => import("./charts").then((m) => m.PerGameBars), { ssr: false, loading: chartLoading });

const MEDALS = ["🥇", "🥈", "🥉"];
const pts = (n: number) => `${Math.round(n * 100) / 100}`;

export function ProfileView({ data, scope }: { data: ProfileDTO; scope?: ReactNode }) {
  const s = data.stats;
  const [tab, setTab] = useState<"tournament" | "cash" | null>(null);
  const current = tab ?? (s.tournament.games >= s.cash.games ? "tournament" : "cash");
  const both = s.tournament.games > 0 && s.cash.games > 0;

  return (
    <div>
      <div className="glass mb-4 rounded-[34px] px-5 pb-5 pt-5">
        <div className="flex items-center gap-4">
          {data.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white/40" />
          ) : (
            <span className="chip grid h-16 w-16 shrink-0 place-items-center font-display text-xl font-bold text-white" style={{ ["--chip" as string]: "var(--felt)" }}>
              <span className="relative z-10">{data.name.slice(0, 1).toUpperCase()}</span>
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display truncate text-[1.5rem] font-bold leading-tight">{data.name}</h1>
            <div className="truncate text-[13px] font-semibold text-hint">
              {data.username ? `@${data.username} · ` : ""}
              {data.chat ? `у групі «${data.chat.title}»` : "усі ігри"}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <Tile value={s.games} label={pluralUk(s.games, "гра", "гри", "ігор")} />
          <Tile value={s.wins} label={pluralUk(s.wins, "перемога", "перемоги", "перемог")} />
          <Tile value={s.podiums} label="у топ-3" />
          <Tile value={`${Math.round(s.winRate * 100)}%`} label="перемог" />
        </div>
        {s.bestWinStreak > 1 && (
          <div className="mt-3 rounded-[18px] bg-gold/14 px-3.5 py-2 text-[13px] font-bold text-gold">
            🔥 Найдовша серія перемог: {s.bestWinStreak} поспіль
          </div>
        )}
      </div>

      {scope}

      {s.games === 0 ? (
        <Section>
          <Empty icon="🃏" title="Ще немає завершених ігор">
            Статистика з&apos;явиться після першої завершеної гри.
          </Empty>
        </Section>
      ) : (
        <>
          {both && (
            <div className="mb-4">
              <Segmented
                value={current}
                onChange={setTab}
                options={[
                  { value: "tournament", label: `Турніри · ${s.tournament.games}` },
                  { value: "cash", label: `Кеш · ${s.cash.games}` },
                ]}
              />
            </div>
          )}
          {current === "tournament" ? <TournamentStats data={data} /> : <CashStats data={data} />}

          <Section title="Останні ігри">
            {s.recent.slice(0, 15).map((g) => (
              <Link
                key={g.gameId}
                href={`/g/${g.gameId}/summary`}
                className="flex items-center gap-3 border-b hairline px-4 py-3 transition-colors last:border-b-0 active:bg-fg/5"
              >
                <span className="w-7 text-center text-lg">{MEDALS[g.place - 1] ?? <span className="text-sm font-bold text-hint">{g.place}</span>}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{g.name}</span>
                  <span className="block truncate text-[12px] text-hint">
                    {g.type === "cash" ? "Кеш" : "Турнір"} · {fmtDate(new Date(g.t))} · {g.place}/{g.entrants}
                    {g.chatTitle && !data.chat ? ` · ${g.chatTitle}` : ""}
                  </span>
                </span>
                {g.type === "cash" ? (
                  <Signed value={g.netBuyins} className="shrink-0 font-bold">
                    {fmtBuyins(g.netBuyins)}
                  </Signed>
                ) : (
                  <span className="shrink-0 font-bold tabular">{g.points} очк.</span>
                )}
              </Link>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function TournamentStats({ data }: { data: ProfileDTO }) {
  const t = data.stats.tournament;
  if (!t.games) return <Section><Empty icon="🏆" title="Турнірів ще не було" /></Section>;
  const timeline = data.stats.tournamentTimeline.map((g) => ({ gameId: g.gameId, name: g.name, t: g.t, value: g.points ?? 0, cum: g.cum }));
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Big value={t.points} label="очок усього" sub={`у середньому ${pts(t.avgPoints)} за турнір`} />
        <Big value={t.avgPlace ? pts(t.avgPlace) : "—"} label="середнє місце" sub={`найкраще — ${t.bestPlace}-е`} />
        <Big value={t.wins} label="перемог" sub={`з ${t.games} турнірів`} />
        <Big value={t.podiums} label="разів у топ-3" sub={`${Math.round((t.podiums / t.games) * 100)}% турнірів`} />
      </div>
      {timeline.length > 1 && (
        <Section title="Очки наростаючим підсумком">
          <CumulativeChart data={timeline} format={(n) => pts(n)} label="Разом" />
        </Section>
      )}
      <Section title="Які місця займав">
        <HBars
          items={t.placeDist.map((d) => ({
            key: String(d.place),
            label: `${MEDALS[d.place - 1] ?? ""} ${d.place}-е місце`.trim(),
            value: d.count,
            display: `${d.count} ${pluralUk(d.count, "раз", "рази", "разів")}`,
            color: d.place === 1 ? "var(--gold)" : undefined,
          }))}
        />
      </Section>
    </>
  );
}

function CashStats({ data }: { data: ProfileDTO }) {
  const c = data.stats.cash;
  if (!c.games) return <Section><Empty icon="💵" title="Кеш-ігор ще не було" /></Section>;
  const timeline = data.stats.cashTimeline.map((g) => ({ gameId: g.gameId, name: g.name, t: g.t, value: g.netBuyins, cum: g.cum }));
  const bi = (n: number) => fmtBuyins(n).replace(" БІ", "");
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Big value={<Signed value={c.netBuyins}>{fmtBuyins(c.netBuyins)}</Signed>} label="загальний результат" sub={`${fmtSigned(c.netChips)} фішок`} />
        <Big value={<Signed value={c.avgBuyins}>{fmtBuyins(c.avgBuyins)}</Signed>} label="у середньому за гру" sub={`${c.games} ${pluralUk(c.games, "гра", "гри", "ігор")}`} />
        <Big value={`${c.profitable}/${c.games}`} label="ігор у плюсі" sub={`${Math.round((c.profitable / c.games) * 100)}%`} />
        <Big value={c.rebuys} label="ребаїв і аддонів" sub={`${pts(c.rebuys / c.games)} за гру`} />
      </div>
      {timeline.length > 1 && (
        <Section title="Баланс за весь час (бай-іни)">
          <CumulativeChart data={timeline} format={bi} label="Баланс" />
        </Section>
      )}
      <Section title="Результат кожної гри (бай-іни)">
        <PerGameBars data={timeline} format={bi} />
      </Section>
      {(c.best || c.worst) && (
        <Section>
          {c.best && c.best.value > 0 && (
            <Link href={`/g/${c.best.gameId}/summary`} className="flex items-center justify-between border-b hairline px-4 py-3 last:border-b-0 active:bg-fg/5">
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-hint">Найкраща гра</span>
                <span className="block truncate font-bold">{c.best.name}</span>
              </span>
              <Signed value={c.best.value} className="font-bold">{fmtBuyins(c.best.value)}</Signed>
            </Link>
          )}
          {c.worst && c.worst.value < 0 && (
            <Link href={`/g/${c.worst.gameId}/summary`} className="flex items-center justify-between border-b hairline px-4 py-3 last:border-b-0 active:bg-fg/5">
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-hint">Найважча гра</span>
                <span className="block truncate font-bold">{c.worst.name}</span>
              </span>
              <Signed value={c.worst.value} className="font-bold">{fmtBuyins(c.worst.value)}</Signed>
            </Link>
          )}
        </Section>
      )}
    </>
  );
}

function Tile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-[20px] bg-fg/6 px-1 py-2.5">
      <div className="font-display text-xl font-bold tabular">{value}</div>
      <div className="truncate text-[11px] font-semibold text-hint">{label}</div>
    </div>
  );
}

function Big({ value, label, sub }: { value: ReactNode; label: string; sub?: string }) {
  return (
    <div className="glass rounded-[24px] px-4 py-3.5">
      <div className="font-display text-[1.45rem] font-bold leading-tight tabular">{value}</div>
      <div className="text-[13px] font-bold text-fg/80">{label}</div>
      {sub && <div className="text-[12px] font-medium text-hint">{sub}</div>}
    </div>
  );
}
