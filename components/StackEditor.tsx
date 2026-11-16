"use client";

import { useEffect, useState } from "react";
import { fmtChips, fmtDateTime, fmtSigned } from "@/lib/format";
import { haptic, confirmDialog } from "@/lib/client/telegram";
import type { GameStateDTO, PlayerDTO } from "@/lib/types";
import type { GameActionInput } from "@/lib/server/schemas";
import { canEdit } from "./StackTable";
import { Button, inputCls, Sheet, Signed } from "./ui";

type ActionInput = GameActionInput;

function niceStep(n: number) {
  const nice = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  return nice.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), nice[0]);
}

export function StackEditor({
  state,
  player,
  onClose,
  act,
}: {
  state: GameStateDTO;
  player: PlayerDTO | null;
  onClose: () => void;
  act: (a: ActionInput, ok?: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(0);
  const [fresh, setFresh] = useState(true);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [customBuyin, setCustomBuyin] = useState<string | null>(null);

  useEffect(() => {
    if (player) {
      setValue(player.currentChips);
      setFresh(true);
      setRenaming(false);
      setName(player.displayName);
      setCustomBuyin(null);
    }
  }, [player]);

  if (!player) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const { game } = state;
  const editable = canEdit(state, player);
  const host = state.role === "host" && game.status === "active";
  const small = niceStep(game.startingStack / 20);
  const big = niceStep(game.startingStack / 4);
  const r = state.results.find((x) => x.playerId === player.id);
  const delta = value - player.currentChips;
  const playerBuyins = state.buyins.filter((b) => b.playerId === player.id);

  const press = (d: string) => {
    haptic("select");
    setValue((v) => {
      const base = fresh ? "" : String(v);
      const next = d === "⌫" ? base.slice(0, -1) : (base + d).replace(/^0+(?=\d)/, "");
      return Math.min(999_999_999, Number(next || 0));
    });
    setFresh(false);
  };
  const step = (n: number) => {
    haptic("light");
    setValue((v) => Math.max(0, v + n));
    setFresh(false);
  };

  async function run(a: ActionInput, ok?: string, close = true) {
    setBusy(true);
    const success = await act(a, ok);
    setBusy(false);
    if (success && close) onClose();
    return success;
  }

  return (
    <Sheet open onClose={onClose} title={player.displayName}>
      <div className="mb-3 flex items-center justify-between text-sm text-hint">
        <span>
          Бай-іни: {player.buyinCount} · {fmtChips(player.buyinChips)}
        </span>
        {r && game.type === "cash" && <Signed value={r.netChips} className="font-semibold">{fmtSigned(r.netChips)}</Signed>}
        {game.type === "tournament" && player.status === "busted" && <span>вибув · {player.finishPlace}-е</span>}
      </div>

      {editable ? (
        <>
          <div className="mb-3 rounded-2xl bg-fg/5 px-4 py-3 text-center">
            <div className={`text-4xl font-extrabold tabular ${fresh ? "text-fg" : "text-link"}`}>{fmtChips(value)}</div>
            <div className="h-5 text-sm">
              {delta !== 0 && <Signed value={delta}>{fmtSigned(delta)} від поточного</Signed>}
            </div>
          </div>

          <div className="mb-2 grid grid-cols-4 gap-2">
            {[-big, -small, small, big].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => step(n)}
                className={`h-11 rounded-xl text-sm font-bold tabular active:scale-95 ${n < 0 ? "bg-neg/12 text-neg" : "bg-pos/12 text-pos"}`}
              >
                {n > 0 ? "+" : "−"}
                {fmtChips(Math.abs(n))}
              </button>
            ))}
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => press(d)}
                className="h-13 rounded-xl bg-fg/6 text-xl font-semibold active:scale-95 active:bg-fg/12"
              >
                {d}
              </button>
            ))}
          </div>

          <Button
            size="lg"
            className="mb-3 w-full"
            loading={busy}
            disabled={value === player.currentChips}
            onClick={() => run({ action: "setStack", playerId: player.id, chips: value }, "Стек оновлено")}
          >
            Зберегти стек
          </Button>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
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

          {player.status === "active" ? (
            <Button
              variant="danger"
              className="mb-3 w-full"
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog(`${player.displayName} вибуває?`)) {
                  haptic("heavy");
                  await run({ action: "bust", playerId: player.id }, game.type === "tournament" ? "Гравець вибув" : "Стек обнулено");
                }
              }}
            >
              💥 {game.type === "tournament" ? "Вибув" : "Без фішок"}
            </Button>
          ) : host ? (
            <Button variant="secondary" className="mb-3 w-full" onClick={() => run({ action: "unbust", playerId: player.id }, "Гравця повернуто")}>
              ↩︎ Повернути в гру (без ребаю)
            </Button>
          ) : null}
        </>
      ) : (
        <div className="mb-4 rounded-2xl bg-fg/5 px-4 py-4 text-center">
          <div className="text-4xl font-extrabold tabular">{fmtChips(player.currentChips)}</div>
          <div className="mt-1 text-sm text-hint">
            {state.viewer ? "Змінювати цей стек може лише сам гравець або хост." : "Увійдіть, щоб оновлювати свій стек."}
          </div>
        </div>
      )}

      {playerBuyins.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[13px] font-medium uppercase tracking-wide text-hint">Бай-іни</div>
          <div className="rounded-xl bg-fg/4">
            {playerBuyins.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b border-sep px-3 py-2 text-sm last:border-b-0">
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
                        if (await confirmDialog("Скасувати цей бай-ін? Стек зменшиться на цю суму.")) {
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
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
