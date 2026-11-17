"use client";

import { useT } from "@/lib/i18n/client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { computeTimer, type TimerAction } from "@/lib/game/blinds";
import { api } from "@/lib/client/api";
import { useGame, useNow } from "@/lib/client/useGame";
import { confirmDialog, haptic, isMiniApp, openExternal, useBackButton, useIsMiniApp } from "@/lib/client/telegram";
import { useAppBack } from "@/lib/client/nav";
import { fmtChips, fmtSigned } from "@/lib/format";
import type { GameActionInput } from "@/lib/server/schemas";
import type { PlayerDTO } from "@/lib/types";
import { useMe, useToast } from "@/components/AppShell";
import { BlindTimer } from "@/components/BlindTimer";
import { EndGameSheet } from "@/components/EndGameSheet";
import { GameSettings } from "@/components/GameSettings";
import { LoginPanel } from "@/components/LoginPanel";
import { SeatingSection, SeatingSheet } from "@/components/SeatingView";
import { StackEditor } from "@/components/StackEditor";
import { StackTable } from "@/components/StackTable";
import { IconMore } from "@/components/icons";
import { Badge, Button, Empty, inputCls, PageSkeleton, Row, Section, Sheet } from "@/components/ui";

const StackChart = dynamic(() => import("@/components/StackChart"), { ssr: false, loading: () => <div className="h-[260px]" /> });

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { data: me } = useMe();
  const { data: state, error, isLoading, act, clockOffset, mutate } = useGame(gameId);
  const now = useNow(15_000);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [ending, setEnding] = useState(false);
  const [seating, setSeating] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const miniApp = useIsMiniApp();
  const back = useAppBack("/");
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

  if (isLoading) return <PageSkeleton variant="game" />;
  if (error || !state) return <Empty icon="🤷" title={t("errors.gameNotFound")}>{error?.message}</Empty>;

  const { game } = state;
  const isHost = state.role === "host";
  const active = game.status === "active";
  const selected = state.players.find((p) => p.id === selectedId) ?? null;
  const freeSeats = state.players.filter((p) => p.userId == null);
  const shareUrl = me?.miniAppBase ? `${me.miniAppBase}?startapp=${game.id}` : `${me?.appUrl ?? window.location.origin}/g/${game.id}`;

  async function share() {
    setMenu(false);
    const text = game.joinCode ? t("game.shareText", { name: game.name, code: game.joinCode }) : t("game.shareTextNoCode", { name: game.name });
    if (isMiniApp()) {
      openExternal(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`);
    } else if (navigator.share) {
      await navigator.share({ url: shareUrl, title: text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast(t("game.linkCopied"));
    }
  }

  async function addPlayer() {
    if (!newName.trim()) return;
    setAdding(true);
    if (await run({ action: "addPlayer", displayName: newName.trim() }, t("game.playerAdded"))) setNewName("");
    setAdding(false);
  }

  return (
    <div>
      <header className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h1 className="font-display truncate text-[1.6rem] font-bold leading-tight">{game.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-hint">
            <Badge tone="accent">{t(game.type === "cash" ? "common.cash" : "common.tournament")}</Badge>
            {active ? <Badge tone="pos">{t("common.live")}</Badge> : <Badge>{t("common.finished")}</Badge>}
            <span>
              {t("game.hostLabel", { name: state.host.name })}
              {state.chat ? `, ${state.chat.title}` : ""}
            </span>
          </div>
        </div>
        <button type="button" aria-label={t("game.menu")} onClick={() => setMenu(true)} className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full">
          <IconMore />
        </button>
      </header>

      {active && state.idle && (
        <div className="glass-tint mb-5 rounded-[28px] px-5 py-4">
          <div className="font-bold">{t("game.idleTitle")}</div>
          <div className="mt-0.5 text-[13px] font-medium text-hint">
            {t("game.idleText")}
            {isHost ? t("game.idleHost") : "."}
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
              toast(t("game.codeCopied", { code: game.joinCode! }));
            } catch {
              share();
            }
          }}
          className="glass mb-5 flex w-full items-center gap-4 rounded-[28px] px-4 py-3 text-left transition active:scale-[0.99]"
          aria-label={t("game.codeAria", { code: game.joinCode })}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-fg/80">{t("game.code")}</span>
            <span className="block text-[12px] font-medium text-hint">{t("game.codeHint", { code: game.joinCode })}</span>
          </span>
          <span className="font-display text-[1.9rem] font-bold leading-none tracking-[0.18em] tabular">{game.joinCode}</span>
        </button>
      )}

      {!active && (
        <Link href={`/g/${game.id}/summary`} className="glass-tint mb-5 flex items-center justify-between rounded-[28px] px-5 py-4 font-bold">
          {t("game.finishedBanner")} <span>›</span>
        </Link>
      )}

      {active && <BlindTimer game={game} clockOffset={clockOffset} isHost={isHost} onAction={(a: TimerAction) => run({ action: "timer", timer: a })} />}

      {active && state.role === "viewer" && state.viewer && (
        <Section>
          <div className="p-4">
            <div className="font-display font-bold">{t("game.youPlay")}</div>
            <div className="mb-3 text-sm text-hint">{t("game.youPlayText")}</div>
            <div className="flex flex-wrap gap-2">
              {freeSeats.map((p) => (
                <Button key={p.id} size="sm" variant="secondary" onClick={() => run({ action: "join", playerId: p.id }, t("game.youAre", { name: p.displayName }))}>
                  {t("game.iAm", { name: p.displayName })}
                </Button>
              ))}
              <Button size="sm" onClick={() => run({ action: "join" }, t("join.joined"))}>
                {t("game.sitNew")}
              </Button>
            </div>
          </div>
        </Section>
      )}
      {active && !state.viewer && !miniApp && <LoginPanel compact />}

      <Section
        title={t("game.players", { n: state.players.length })}
        action={
          state.check.diff !== 0 ? (
            <span className="text-[13px] font-bold text-neg">{t("game.chipsDiff", { diff: fmtSigned(state.check.diff) })}</span>
          ) : (
            <span className="text-[13px] font-semibold text-hint tabular">{t("game.onTable", { n: fmtChips(state.check.totalStacks) })}</span>
          )
        }
      >
        {state.players.length ? (
          <StackTable state={state} now={now} bb={bb} onSelect={(p: PlayerDTO) => setSelectedId(p.id)} />
        ) : (
          <Empty icon="🪑" title={t("game.nobody")} />
        )}
        {isHost && active && (
          <div className="flex gap-2 border-t border-sep p-3">
            <input
              className={inputCls}
              placeholder={t("game.addPlayer")}
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            />
            <Button variant="secondary" onClick={addPlayer} loading={adding} disabled={!newName.trim()}>
              {t("common.add")}
            </Button>
          </div>
        )}
      </Section>
      {state.check.diff !== 0 && (
        <p className="-mt-2 mb-4 px-4 text-[13px] text-hint">
          {t("game.diffHint", { stacks: fmtChips(state.check.totalStacks), buyins: fmtChips(state.check.totalBuyins) })}
        </p>
      )}

      <SeatingSection state={state} act={run} onReseat={() => setSeating(true)} />

      <Section title={t("game.chart")}>
        <StackChart state={state} />
      </Section>

      <StackEditor state={state} player={selected} onClose={() => setSelectedId(null)} act={run} />

      <Sheet open={menu} onClose={() => setMenu(false)} title={t("game.menuTitle")}>
        <div className="mb-3 overflow-hidden rounded-[24px] bg-fg/5">
          <Row onClick={share}>{t("game.share")}</Row>
          <Row href={`/g/${game.id}/summary`}>{t("game.summary")}</Row>
          <Row href={`/g/${game.id}/tv`}>{t("game.tv")}</Row>
          <Row onClick={() => openExternal(`${window.location.origin}/api/games/${game.id}/export.csv?lang=${t.lang}`)}>{t("game.csv")}</Row>
          {state.chat && <Row href={`/leaderboard/${state.chat.publicId}`}>{t("game.groupLb")}</Row>}
          {isHost && active && (
            <Row onClick={() => (setMenu(false), setSettings(true))}>{t("game.settings")}</Row>
          )}
          {isHost && active && (
            <Row onClick={() => (setMenu(false), setSeating(true))}>{t(game.tables ? "game.seatAgain" : "game.seating")}</Row>
          )}
          {isHost && active && (
            <Row
              onClick={async () => {
                setMenu(false);
                if (await confirmDialog(t("game.resetTimerConfirm"))) run({ action: "timer", timer: "reset" }, t("game.timerReset"));
              }}
            >
              {t("game.resetTimer")}
            </Row>
          )}
          {isHost && !active && <Row onClick={() => (setMenu(false), run({ action: "reopen" }, t("game.reopened")))}>{t("game.reopen")}</Row>}
        </div>
        {isHost && active && (
          <Button size="lg" className="mb-2 w-full" onClick={() => (setMenu(false), setEnding(true))}>
            {t("game.end")}
          </Button>
        )}
        {isHost && (
          <Button
            variant="danger"
            className="mb-2 w-full"
            onClick={async () => {
              if (await confirmDialog(t("game.deleteConfirm"))) {
                try {
                  await api(`/api/games/${game.id}`, "DELETE");
                  router.replace("/");
                } catch (e) {
                  toast((e as Error).message);
                }
              }
            }}
          >
            {t("game.delete")}
          </Button>
        )}
      </Sheet>

      {isHost && <SeatingSheet state={state} open={seating} onClose={() => setSeating(false)} act={run} />}
      {isHost && <GameSettings state={state} open={settings} onClose={() => setSettings(false)} onSaved={() => mutate()} toast={toast} />}
      {isHost && (
        <EndGameSheet
          state={state}
          open={ending}
          onClose={() => setEnding(false)}
          onConfirm={async (finalStacks) => {
            if (await run({ action: "end", finalStacks }, t("game.ended"))) {
              setEnding(false);
              router.push(`/g/${game.id}/summary`);
            }
          }}
        />
      )}
    </div>
  );
}
