"use client";

import { useEffect, useState } from "react";
import { fmtChips, fmtSigned } from "@/lib/format";
import type { GameStateDTO } from "@/lib/types";
import { Button, inputCls, Sheet, Signed } from "./ui";

/**
 * The one moment stacks are counted: the host types every player's final chips.
 * Cash — result = final stack − buy-ins. Tournament — players still in are ranked by their chips.
 */
export function EndGameSheet({
  state,
  open,
  onClose,
  onConfirm,
}: {
  state: GameStateDTO;
  open: boolean;
  onClose: () => void;
  onConfirm: (finalStacks: Record<string, number>) => Promise<void>;
}) {
  const [stacks, setStacks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { game } = state;
  const cash = game.type === "cash";
  const stillIn = state.players.filter((p) => p.status === "active");
  const busted = state.results.filter((r) => state.players.find((p) => p.id === r.playerId)?.status === "busted");
  const counted = cash ? state.players : stillIn.length > 1 ? stillIn : [];

  useEffect(() => {
    if (open) setStacks({});
  }, [open]);

  const missing = counted.filter((p) => stacks[String(p.id)] == null || stacks[String(p.id)] === "").length;
  const total = counted.reduce((s, p) => s + (Number(stacks[String(p.id)]) || 0), 0);
  const diff = total - state.check.totalBuyins;

  return (
    <Sheet open={open} onClose={onClose} title="Завершити гру">
      {counted.length > 0 && (
        <>
          <p className="mb-3 px-1 text-sm text-hint">
            {cash
              ? "Порахуйте фішки кожного гравця. Результат = фінальний стек − бай-іни."
              : "Кілька гравців ще в грі — внесіть їхні стеки, місця розставимо за кількістю фішок."}
          </p>
          <div className="mb-3 rounded-[22px] bg-fg/5">
            {counted.map((p) => {
              const raw = stacks[String(p.id)];
              const v = Number(raw) || 0;
              return (
                <label key={p.id} className="flex items-center gap-3 border-b hairline px-3.5 py-2.5 last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.displayName}</span>
                    <span className="block text-[12px] text-hint tabular">
                      куплено {fmtChips(p.buyinChips)}
                      {cash && raw ? (
                        <>
                          {" · "}
                          <Signed value={v - p.buyinChips}>{fmtSigned(v - p.buyinChips)}</Signed>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <input
                    className={`${inputCls} !w-32 text-right tabular`}
                    inputMode="numeric"
                    placeholder="фішки"
                    aria-label={`Фінальний стек: ${p.displayName}`}
                    value={raw ?? ""}
                    onChange={(e) => setStacks((s) => ({ ...s, [String(p.id)]: e.target.value.replace(/\D/g, "") }))}
                  />
                </label>
              );
            })}
          </div>
          {cash && missing === 0 && (
            <div className={`mb-4 rounded-[18px] px-3.5 py-2.5 text-sm font-semibold ${diff === 0 ? "bg-pos/12 text-pos" : "bg-neg/12 text-neg"}`}>
              Порахували {fmtChips(total)} з {fmtChips(state.check.totalBuyins)} куплених
              {diff === 0 ? " — все сходиться ✓" : ` — розбіжність ${fmtSigned(diff)}`}
            </div>
          )}
        </>
      )}

      {!cash && (
        <div className="mb-4 rounded-[22px] bg-fg/5">
          {stillIn.length === 1 && (
            <div className="flex items-center justify-between border-b hairline px-3.5 py-2.5">
              <span>
                <b className="mr-2">🥇</b>
                {stillIn[0].displayName}
              </span>
              <span className="text-sm text-hint">переможець</span>
            </div>
          )}
          {busted
            .sort((a, b) => a.place - b.place)
            .map((r) => (
              <div key={r.playerId} className="flex items-center justify-between border-b hairline px-3.5 py-2.5 last:border-b-0">
                <span>
                  <b className="mr-2 tabular">{r.place}.</b>
                  {r.displayName}
                </span>
                <span className="text-sm text-hint">вибув</span>
              </div>
            ))}
        </div>
      )}

      <Button
        size="lg"
        className="mb-2 w-full"
        loading={busy}
        disabled={missing > 0}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm(Object.fromEntries(counted.map((p) => [String(p.id), Number(stacks[String(p.id)]) || 0])));
          } finally {
            setBusy(false);
          }
        }}
      >
        {missing > 0 ? `Залишилось внести: ${missing}` : "🏁 Завершити й показати підсумок"}
      </Button>
    </Sheet>
  );
}
