"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { computeTimer, type TimerAction } from "@/lib/game/blinds";
import { api } from "@/lib/client/api";
import { useGame, useNow } from "@/lib/client/useGame";
import { confirmDialog, haptic, isMiniApp, openExternal, useBackButton } from "@/lib/client/telegram";
import { fmtChips, fmtSigned } from "@/lib/format";
import type { GameActionInput } from "@/lib/server/schemas";
import type { PlayerDTO } from "@/lib/types";
import { useMe, useToast } from "@/components/AppShell";
import { BlindTimer } from "@/components/BlindTimer";
import { EndGameSheet } from "@/components/EndGameSheet";
import { GameSettings } from "@/components/GameSettings";
import { LoginPanel } from "@/components/LoginPanel";
import { StackEditor } from "@/components/StackEditor";
import { StackTable } from "@/components/StackTable";
import { IconMore } from "@/components/icons";
import { Badge, Button, Empty, inputCls, PageLoader, Row, Section, Sheet } from "@/components/ui";

const StackChart = dynamic(() => import("@/components/StackChart"), { ssr: false, loading: () => <div className="h-[260px]" /> });

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useMe();
  const { data: state, error, isLoading, act, clockOffset, mutate } = useGame(gameId);
  const now = useNow(15_000);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [ending, setEnding] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const back = useCallback(() => router.push("/"), [router]);
  useBackButton(back);

  const run = useCallback(
    async (a: GameActionInput, ok?: string) => {
      try {
        await act(a);
        if (ok) toast(ok);
        return true;
      } catch (e) {
        haptic("error");
        toast((e as Error).message);
        return false;
      }
    },
    [act, toast],
  );

  const bb = useMemo(() => {
    if (!state) return 0;
    const g = state.game;
    const v = computeTimer(
      g.blindStructure,
      { blindLevel: g.blindLevel, levelStartedAt: g.levelStartedAt ? new Date(g.levelStartedAt) : null, pausedRemainingMs: g.pausedRemainingMs },
      new Date(now + clockOffset),
    );
    return v.level.isBreak ? (g.blindStructure.slice(0, v.levelIndex).reverse().find((l) => !l.isBreak)?.bb ?? 0) : v.level.bb;
  }, [state, now, clockOffset]);

  if (isLoading) return <PageLoader />;
  if (error || !state) return <Empty icon="🤷" title="Гру не знайдено">{error?.message}</Empty>;

  const { game } = state;
  const isHost = state.role === "host";
  const active = game.status === "active";
  const selected = state.players.find((p) => p.id === selectedId) ?? null;
  const freeSeats = state.players.filter((p) => p.userId == null);
  const shareUrl = me?.miniAppBase ? `${me.miniAppBase}?startapp=${game.id}` : `${me?.appUrl ?? window.location.origin}/g/${game.id}`;

  async function share() {
    setMenu(false);
    const text = game.joinCode ? `Сідай за стіл «${game.name}»: код ${game.joinCode}` : `Гра «${game.name}»`;
    if (isMiniApp()) {
      openExternal(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`);
    } else if (navigator.share) {
      await navigator.share({ url: shareUrl, title: text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast("Посилання скопійовано");
    }
  }

  async function addPlayer() {
    if (!newName.trim()) return;
    setAdding(true);
    if (await run({ action: "addPlayer", displayName: newName.trim() }, "Гравця додано")) setNewName("");
    setAdding(false);
  }

  return (
    <div>
      <header className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h1 className="font-display truncate text-[1.6rem] font-bold leading-tight">{game.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-hint">
            <Badge tone="accent">{game.type === "cash" ? "Кеш" : "Турнір"}</Badge>
            {active ? <Badge tone="pos">триває</Badge> : <Badge>завершена</Badge>}
            <span>
              хост {state.host.name}
              {state.chat ? `, ${state.chat.title}` : ""}
            </span>
          </div>
        </div>
        <button type="button" aria-label="Меню гри" onClick={() => setMenu(true)} className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full">
          <IconMore />
        </button>
      </header>

      {active && state.idle && (
        <div className="glass-tint mb-5 rounded-[28px] px-5 py-4">
          <div className="font-bold">💤 Гра неактивна понад добу</div>
          <div className="mt-0.5 text-[13px] font-medium text-hint">
            Код гри звільнено. Будь-яка дія за столом відновить гру з новим кодом{isHost ? " — або завершіть її в меню." : "."}
          </div>
        </div>
      )}

      {active && !state.idle && game.joinCode && (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(game.joinCode!);
              haptic("light");
              toast(`Код ${game.joinCode} скопійовано`);
            } catch {
              share();
            }
          }}
          className="glass mb-5 flex w-full items-center gap-4 rounded-[28px] px-4 py-3 text-left transition active:scale-[0.99]"
          aria-label={`Код гри ${game.joinCode}, скопіювати`}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-fg/80">Код гри</span>
            <span className="block text-[12px] font-medium text-hint">друзі вводять його на головній або пишуть боту /join {game.joinCode}</span>
          </span>
          <span className="font-display text-[1.9rem] font-bold leading-none tracking-[0.18em] tabular">{game.joinCode}</span>
        </button>
      )}

      {!active && (
        <Link href={`/g/${game.id}/summary`} className="glass-tint mb-5 flex items-center justify-between rounded-[28px] px-5 py-4 font-bold">
          🏁 Гру завершено — переглянути підсумок <span>›</span>
        </Link>
      )}

      {active && <BlindTimer game={game} clockOffset={clockOffset} isHost={isHost} onAction={(a: TimerAction) => run({ action: "timer", timer: a })} />}

      {active && state.role === "viewer" && state.viewer && (
        <Section>
          <div className="p-4">
            <div className="font-display font-bold">Ви граєте?</div>
            <div className="mb-3 text-sm text-hint">Оберіть своє місце, щоб оновлювати власний стек.</div>
            <div className="flex flex-wrap gap-2">
              {freeSeats.map((p) => (
                <Button key={p.id} size="sm" variant="secondary" onClick={() => run({ action: "join", playerId: p.id }, `Ви — ${p.displayName}`)}>
                  Я — {p.displayName}
                </Button>
              ))}
              <Button size="sm" onClick={() => run({ action: "join" }, "Ви за столом!")}>
                ＋ Сісти новим гравцем
              </Button>
            </div>
          </div>
        </Section>
      )}
      {active && !state.viewer && !isMiniApp() && <LoginPanel compact />}

      <Section
        title={`Гравці (${state.players.length})`}
        action={
          state.check.diff !== 0 ? (
            <span className="text-[13px] font-bold text-neg">⚠ {fmtSigned(state.check.diff)} фішок</span>
          ) : (
            <span className="text-[13px] font-semibold text-hint tabular">на столі {fmtChips(state.check.totalStacks)}</span>
          )
        }
      >
        {state.players.length ? (
          <StackTable state={state} now={now} bb={bb} onSelect={(p: PlayerDTO) => setSelectedId(p.id)} />
        ) : (
          <Empty icon="🪑" title="За столом нікого" />
        )}
        {isHost && active && (
          <div className="flex gap-2 border-t border-sep p-3">
            <input
              className={inputCls}
              placeholder="Додати гравця"
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            />
            <Button variant="secondary" onClick={addPlayer} loading={adding} disabled={!newName.trim()}>
              Додати
            </Button>
          </div>
        )}
      </Section>
      {state.check.diff !== 0 && (
        <p className="-mt-2 mb-4 px-4 text-[13px] text-hint">
          За столом {fmtChips(state.check.totalStacks)}, куплено {fmtChips(state.check.totalBuyins)}. Хтось, мабуть, не оновив стек.
        </p>
      )}

      <Section title="Стеки в часі">
        <StackChart state={state} />
      </Section>

      <StackEditor state={state} player={selected} onClose={() => setSelectedId(null)} act={run} />

      <Sheet open={menu} onClose={() => setMenu(false)} title="Гра">
        <div className="mb-3 overflow-hidden rounded-[24px] bg-fg/5">
          <Row onClick={share}>📤 Поділитися посиланням</Row>
          <Row href={`/g/${game.id}/summary`}>📊 Підсумок і результати</Row>
          <Row onClick={() => openExternal(`${window.location.origin}/api/games/${game.id}/export.csv`)}>⬇️ Експорт CSV</Row>
          {state.chat && <Row href={`/leaderboard/${state.chat.publicId}`}>🏆 Лідерборд групи</Row>}
          {isHost && active && (
            <Row onClick={() => (setMenu(false), setSettings(true))}>⚙️ Налаштування й блайнди</Row>
          )}
          {isHost && active && (
            <Row
              onClick={async () => {
                setMenu(false);
                if (await confirmDialog("Скинути таймер на перший рівень?")) run({ action: "timer", timer: "reset" }, "Таймер скинуто");
              }}
            >
              ⏱ Скинути таймер
            </Row>
          )}
          {isHost && !active && <Row onClick={() => (setMenu(false), run({ action: "reopen" }, "Гру відновлено"))}>↩︎ Відновити гру</Row>}
        </div>
        {isHost && active && (
          <Button size="lg" className="mb-2 w-full" onClick={() => (setMenu(false), setEnding(true))}>
            🏁 Завершити гру
          </Button>
        )}
        {isHost && (
          <Button
            variant="danger"
            className="mb-2 w-full"
            onClick={async () => {
              if (await confirmDialog("Видалити гру назавжди?")) {
                try {
                  await api(`/api/games/${game.id}`, "DELETE");
                  router.replace("/");
                } catch (e) {
                  toast((e as Error).message);
                }
              }
            }}
          >
            Видалити гру
          </Button>
        )}
      </Sheet>

      {isHost && <GameSettings state={state} open={settings} onClose={() => setSettings(false)} onSaved={() => mutate()} toast={toast} />}
      {isHost && (
        <EndGameSheet
          state={state}
          open={ending}
          onClose={() => setEnding(false)}
          onConfirm={async (finalStacks) => {
            if (await run({ action: "end", finalStacks }, "Гру завершено")) {
              setEnding(false);
              router.push(`/g/${game.id}/summary`);
            }
          }}
        />
      )}
    </div>
  );
}
