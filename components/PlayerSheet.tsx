"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtChips, fmtDateTime } from "@/lib/format";
import { confirmDialog, haptic } from "@/lib/client/telegram";
import type { GameStateDTO, PlayerDTO } from "@/lib/types";
import type { GameActionInput } from "@/lib/server/schemas";
import { canEdit } from "./PlayerList";
import { Button, inputCls, Sheet } from "./ui";

export function profileHref(state: GameStateDTO, p: { userId: number | null; key?: string; displayName: string }) {
  const key = p.key ?? (p.userId != null ? `u:${p.userId}` : `n:${p.displayName.trim().toLowerCase().replace(/\s+/g, " ")}`);
  if (state.chat) return `/profile/${encodeURIComponent(key)}?chat=${state.chat.publicId}`;
  return p.userId != null ? `/profile/${encodeURIComponent(key)}` : null;
}

/** Rebuys, elimination and seat management for one player — no stack counting during play. */
export function PlayerSheet({
  state,
  player,
  onClose,
  act,
}: {
  state: GameStateDTO;
  player: PlayerDTO | null;
  onClose: () => void;
  act: (a: GameActionInput, ok?: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [customBuyin, setCustomBuyin] = useState<string | null>(null);

  useEffect(() => {
    if (player) {
      setRenaming(false);
      setName(player.displayName);
      setCustomBuyin(null);
    }
  }, [player]);

  if (!player) return null;

  const { game } = state;
  const editable = canEdit(state, player);
  const host = state.role === "host" && game.status === "active";
  const tournament = game.type === "tournament";
  const playerBuyins = state.buyins.filter((b) => b.playerId === player.id);
  const profile = profileHref(state, player);

  async function run(a: GameActionInput, ok?: string, close = true) {
    setBusy(true);
    const success = await act(a, ok);
    setBusy(false);
    if (success && close) onClose();
    return success;
  }

  return (
    <Sheet open onClose={onClose} title={player.displayName}>
      <div className="mb-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-[22px] bg-fg/5 py-3">
          <div className="font-display text-xl font-bold tabular">{fmtChips(player.buyinChips)}</div>
          <div className="text-[12px] font-semibold text-hint">куплено фішок</div>
        </div>
        <div className="rounded-[22px] bg-fg/5 py-3">
          <div className="font-display text-xl font-bold tabular">{player.buyinCount}</div>
          <div className="text-[12px] font-semibold text-hint">бай-інів</div>
        </div>
      </div>

      {editable && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Button
              disabled={busy}
              onClick={() => run({ action: "buyin", playerId: player.id, kind: "rebuy" }, `Ребай +${fmtChips(game.startingStack)}`)}
            >
              🔁 Ребай +{fmtChips(game.startingStack)}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setCustomBuyin(customBuyin == null ? "" : null)}>
              ＋ Інша сума
            </Button>
          </div>
          {customBuyin != null && (
            <div className="mb-3 flex gap-2">
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder="Фішки"
                autoFocus
                value={customBuyin}
                onChange={(e) => setCustomBuyin(e.target.value.replace(/\D/g, ""))}
              />
              <Button
                variant="secondary"
                disabled={!Number(customBuyin)}
                onClick={() => run({ action: "buyin", playerId: player.id, kind: "rebuy", chips: Number(customBuyin) }, "Ребай додано")}
              >
                Ребай
              </Button>
              <Button
                variant="secondary"
                disabled={!Number(customBuyin)}
                onClick={() => run({ action: "buyin", playerId: player.id, kind: "addon", chips: Number(customBuyin) }, "Аддон додано")}
              >
                Аддон
              </Button>
            </div>
          )}

          {tournament &&
            (player.status === "active" ? (
              <Button
                variant="danger"
                className="mb-3 w-full"
                disabled={busy}
                onClick={async () => {
                  if (await confirmDialog(`${player.displayName} вибуває?`)) {
                    haptic("heavy");
                    await run({ action: "bust", playerId: player.id }, "Гравець вибув");
                  }
                }}
              >
                💥 Вибув
              </Button>
            ) : host ? (
              <Button variant="secondary" className="mb-3 w-full" onClick={() => run({ action: "unbust", playerId: player.id }, "Гравця повернуто")}>
                ↩︎ Повернути в гру (без ребаю)
              </Button>
            ) : null)}
        </>
      )}

      {game.status === "active" && (
        <p className="mb-3 px-1 text-[12px] text-hint">
          Стеки під час гри не рахуємо — хост внесе фінальні фішки, коли завершуватиме гру.
        </p>
      )}

      {playerBuyins.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 px-1 text-[13px] font-bold text-hint">Бай-іни</div>
          <div className="rounded-[22px] bg-fg/5">
            {playerBuyins.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b hairline px-3.5 py-2.5 text-sm last:border-b-0">
                <span>
                  {b.kind === "buyin" ? "Бай-ін" : b.kind === "rebuy" ? "Ребай" : "Аддон"} · <b className="tabular">{fmtChips(b.chips)}</b>
                </span>
                <span className="flex items-center gap-3 text-hint">
                  {fmtDateTime(b.createdAt)}
                  {host && (
                    <button
                      type="button"
                      aria-label="Скасувати бай-ін"
                      className="text-danger"
                      onClick={async () => {
                        if (await confirmDialog("Скасувати цей бай-ін?")) {
                          await run({ action: "deleteBuyin", buyinId: b.id }, "Бай-ін скасовано", false);
                        }
                      }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile && (
        <Link href={profile} className="glass mb-3 flex h-11 items-center justify-center rounded-full text-[15px] font-bold text-link">
          📈 Профіль і статистика
        </Link>
      )}

      {editable && (
        <div className="mb-2">
          {renaming ? (
            <div className="flex gap-2">
              <input className={inputCls} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              <Button variant="secondary" disabled={!name.trim()} onClick={() => run({ action: "updatePlayer", playerId: player.id, displayName: name }, "Збережено")}>
                OK
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm">
              <button type="button" className="text-link" onClick={() => setRenaming(true)}>
                Перейменувати
              </button>
              {host && player.userId != null && player.userId !== game.hostUserId && (
                <button type="button" className="text-link" onClick={() => run({ action: "updatePlayer", playerId: player.id, unlink: true }, "Відв'язано")}>
                  Відв&apos;язати Telegram
                </button>
              )}
              {host && (
                <button
                  type="button"
                  className="text-danger"
                  onClick={async () => {
                    if (await confirmDialog(`Видалити ${player.displayName} з гри разом з усіма бай-інами?`)) {
                      await run({ action: "removePlayer", playerId: player.id }, "Гравця видалено");
                    }
                  }}
                >
                  Видалити з гри
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
