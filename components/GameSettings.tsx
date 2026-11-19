"use client";

import { useEffect, useState } from "react";
import { BLIND_TEMPLATES, buildStructure, type BlindLevel, type BlindTemplateId } from "@/lib/game/blinds";
import { api } from "@/lib/client/api";
import { haptic } from "@/lib/client/telegram";
import type { GameStateDTO } from "@/lib/types";
import { Button, inputCls, Sheet } from "./ui";

export const TURN_CHOICES = [0, 20, 30, 45, 60];

const num = (s: string) => Number(s.replace(/\D/g, "")) || 0;

export function GameSettings({
  state,
  open,
  onClose,
  onSaved,
  toast,
}: {
  state: GameStateDTO;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string) => void;
}) {
  const { game } = state;
  const [name, setName] = useState(game.name);
  const [turn, setTurn] = useState(game.turnSeconds);
  const [levels, setLevels] = useState<BlindLevel[]>(game.blindStructure);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(game.name);
      setTurn(game.turnSeconds);
      setLevels(game.blindStructure);
    }
  }, [open, game]);

  const update = (i: number, patch: Partial<BlindLevel>) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name, turnSeconds: turn };
      if (JSON.stringify(levels) !== JSON.stringify(game.blindStructure)) body.blindStructure = levels;
      await api(`/api/games/${game.id}`, "PATCH", body);
      haptic("success");
      toast("Налаштування збережено");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Налаштування гри">
      <label className="mb-3 block">
        <span className="mb-1 block text-[13px] text-hint">Назва</span>
        <input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="mb-4">
        <span className="mb-1 block text-[13px] text-hint">Таймер ходу (секунд на рішення)</span>
        <div className="flex gap-2">
          {TURN_CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTurn(m)}
              aria-pressed={turn === m}
              className={`flex-1 rounded-full py-2.5 text-sm font-bold ${turn === m ? "glass-tint" : "bg-fg/6"}`}
            >
              {m ? `${m} с` : "Вимк."}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="px-1 text-[15px] font-bold">Структура блайндів</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {(Object.keys(BLIND_TEMPLATES) as BlindTemplateId[]).map((t) => (
          <button
            key={t}
            type="button"
            className="glass rounded-full px-3.5 py-1.5 text-[13px] font-bold text-link"
            onClick={() => setLevels(buildStructure(t, game.startingStack))}
          >
            {BLIND_TEMPLATES[t].label}
          </button>
        ))}
      </div>
      <div className="mb-2 grid grid-cols-[1.5rem_1fr_1fr_1fr_3.5rem_1.5rem] items-center gap-1.5 px-1 text-[11px] text-hint">
        <span>#</span>
        <span>SB</span>
        <span>BB</span>
        <span>Анте</span>
        <span>Хв</span>
        <span />
      </div>
      <div className="mb-3 space-y-1.5">
        {levels.map((l, i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1fr_3.5rem_1.5rem] items-center gap-1.5">
            <span className={`text-center text-xs ${i === game.blindLevel ? "font-bold text-link" : "text-hint"}`}>{i + 1}</span>
            {l.isBreak ? (
              <span className="col-span-3 rounded-lg bg-fg/5 px-2 py-2 text-sm text-hint">☕ Перерва</span>
            ) : (
              <>
                <input className={`${inputCls} !px-2 !py-1.5 text-sm`} inputMode="numeric" value={l.sb} onChange={(e) => update(i, { sb: num(e.target.value) })} />
                <input className={`${inputCls} !px-2 !py-1.5 text-sm`} inputMode="numeric" value={l.bb} onChange={(e) => update(i, { bb: num(e.target.value) })} />
                <input className={`${inputCls} !px-2 !py-1.5 text-sm`} inputMode="numeric" value={l.ante} onChange={(e) => update(i, { ante: num(e.target.value) })} />
              </>
            )}
            <input className={`${inputCls} !px-2 !py-1.5 text-sm`} inputMode="numeric" value={l.minutes} onChange={(e) => update(i, { minutes: num(e.target.value) })} />
            <button type="button" aria-label="Видалити рівень" className="text-danger" disabled={levels.length < 2} onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mb-1 text-xs text-hint">0 хв — рівень без обмеження часу.</div>
      <div className="mb-4 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const last = [...levels].reverse().find((l) => !l.isBreak) ?? { sb: 25, bb: 50, ante: 0, minutes: 20 };
            setLevels((ls) => [...ls, { sb: last.sb * 2, bb: last.bb * 2, ante: last.ante * 2, minutes: last.minutes }]);
          }}
        >
          ＋ Рівень
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLevels((ls) => [...ls, { sb: 0, bb: 0, ante: 0, minutes: 10, isBreak: true }])}>
          ＋ Перерва
        </Button>
      </div>

      <Button size="lg" className="mb-2 w-full" onClick={save} loading={busy}>
        Зберегти
      </Button>
    </Sheet>
  );
}
