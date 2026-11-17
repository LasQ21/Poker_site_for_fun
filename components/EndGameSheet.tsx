"use client";

import { useEffect, useState } from "react";
import { fmtChips, fmtSigned } from "@/lib/format";
import { useClosingConfirmation, useMainButton } from "@/lib/client/telegram";
import type { GameStateDTO } from "@/lib/types";
import { Button, inputCls, Sheet, Signed } from "./ui";

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

  // Prefill when opened; later live updates must not overwrite what the host typed.
  useEffect(() => {
    if (open) setStacks(Object.fromEntries(state.players.map((p) => [String(p.id), String(p.currentChips)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = Object.values(stacks).reduce((s, v) => s + (Number(v) || 0), 0);
  const diff = total - state.check.totalBuyins;
  const dirty = open && state.players.some((p) => stacks[String(p.id)] != null && Number(stacks[String(p.id)]) !== p.currentChips);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(Object.fromEntries(Object.entries(stacks).map(([k, v]) => [k, Number(v) || 0])));
    } finally {
      setBusy(false);
    }
  }

  useClosingConfirmation(dirty);
  const nativeButton = useMainButton(open ? { text: "🏁 Завершити гру", loading: busy, onClick: () => void confirm() } : null);

  return (
    <Sheet open={open} onClose={onClose} title="Завершити гру">
      {game.type === "cash" ? (
        <>
          <p className="mb-3 text-sm text-hint">Перевірте фінальні стеки — результат кожного = стек − бай-іни.</p>
          <div className="mb-3 rounded-xl bg-fg/4">
            {state.players.map((p) => {
              const v = Number(stacks[String(p.id)]) || 0;
              return (
                <div key={p.id} className="flex items-center gap-3 border-b border-sep px-3 py-2 last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.displayName}</span>
                    <Signed value={v - p.buyinChips} className="text-xs">{fmtSigned(v - p.buyinChips)}</Signed>
                  </span>
                  <input
                    className={`${inputCls} !w-32 text-right tabular`}
                    inputMode="numeric"
                    value={stacks[String(p.id)] ?? ""}
                    onChange={(e) => setStacks((s) => ({ ...s, [String(p.id)]: e.target.value.replace(/\D/g, "") }))}
                  />
                </div>
              );
            })}
          </div>
          <div className={`mb-4 rounded-xl px-3 py-2 text-sm ${diff === 0 ? "bg-pos/12 text-pos" : "bg-neg/12 text-neg"}`}>
            За столом {fmtChips(total)} з {fmtChips(state.check.totalBuyins)} куплених
            {diff === 0 ? " — все сходиться ✓" : ` — розбіжність ${fmtSigned(diff)}`}
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-hint">Гравці, що ще в грі, отримають місця за кількістю фішок.</p>
          <div className="mb-4 rounded-xl bg-fg/4">
            {state.results.map((r) => (
              <div key={r.playerId} className="flex items-center justify-between border-b border-sep px-3 py-2 last:border-b-0">
                <span>
                  <b className="mr-2 tabular">{r.place}.</b>
                  {r.displayName}
                </span>
                <span className="text-sm text-hint">{r.points} очк.</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!nativeButton && (
        <Button size="lg" className="mb-2 w-full" loading={busy} onClick={confirm}>
          🏁 Завершити й показати підсумок
        </Button>
      )}
    </Sheet>
  );
}
