"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { TimerAction } from "@/lib/game/blinds";
import { api } from "@/lib/client/api";
import { useGame } from "@/lib/client/useGame";
import { confirmDialog, haptic, isMiniApp, openExternal, useBackButton } from "@/lib/client/telegram";
import { fmtChips } from "@/lib/format";
import type { GameActionInput } from "@/lib/server/schemas";
import type { PlayerDTO } from "@/lib/types";
import { useMe, useToast } from "@/components/AppShell";
import { BlindTimer } from "@/components/BlindTimer";
import { EndGameSheet } from "@/components/EndGameSheet";
import { GameSettings } from "@/components/GameSettings";
import { LoginPanel } from "@/components/LoginPanel";
import { PlayerList } from "@/components/PlayerList";
import { PlayerSheet } from "@/components/PlayerSheet";
import { TurnTimer } from "@/components/TurnTimer";
import { IconMore } from "@/components/icons";
import { Badge, Button, Empty, inputCls, PageLoader, Row, Section, Sheet } from "@/components/ui";

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useMe();
  const { data: state, error, isLoading, act, clockOffset, mutate } = useGame(gameId);
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

      {active && game.joinCode && (
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
      {active && game.turnSeconds > 0 && <TurnTimer seconds={game.turnSeconds} />}

      {active && state.role === "viewer" && state.viewer && (
        <Section>
          <div className="p-4">
            <div className="font-display font-bold">Ви граєте?</div>
            <div className="mb-3 text-sm text-hint">Оберіть своє місце — ігри потраплять у вашу статистику.</div>
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
        action={<span className="text-[13px] font-semibold text-hint tabular">куплено {fmtChips(state.check.totalBuyins)}</span>}
      >
        {state.players.length ? (
          <PlayerList state={state} onSelect={(p: PlayerDTO) => setSelectedId(p.id)} />
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
      {isHost && active && state.players.length > 0 && (
        <Button size="lg" className="mb-5 w-full" onClick={() => setEnding(true)}>
          🏁 Завершити й порахувати стеки
        </Button>
      )}

      <PlayerSheet state={state} player={selected} onClose={() => setSelectedId(null)} act={run} />

      <Sheet open={menu} onClose={() => setMenu(false)} title="Гра">
        <div className="mb-3 overflow-hidden rounded-[24px] bg-fg/5">
          <Row onClick={share}>📤 Поділитися посиланням</Row>
          <Row href={`/g/${game.id}/summary`}>📊 Підсумок і результати</Row>
          <Row onClick={() => openExternal(`${window.location.origin}/api/games/${game.id}/export.csv`)}>⬇️ Експорт CSV</Row>
          {state.chat && <Row href={`/leaderboard/${state.chat.publicId}`}>🏆 Лідерборд групи</Row>}
          {state.myPlayerId != null && state.viewer && (
            <Row href={state.chat ? `/profile/u%3A${state.viewer.id}?chat=${state.chat.publicId}` : "/profile"}>👤 Моя статистика</Row>
          )}
          {isHost && active && (
            <Row onClick={() => (setMenu(false), setSettings(true))}>⚙️ Блайнди й таймер ходу</Row>
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
