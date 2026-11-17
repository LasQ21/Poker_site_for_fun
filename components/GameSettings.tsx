"use client";

import { useT } from "@/lib/i18n/client";
import { useEffect, useState } from "react";
import { BLIND_TEMPLATES, buildStructure, type BlindLevel, type BlindTemplateId } from "@/lib/game/blinds";
import { api } from "@/lib/client/api";
import { haptic, useClosingConfirmation, useMainButton } from "@/lib/client/telegram";
import type { GameStateDTO } from "@/lib/types";
import { Button, inputCls, Sheet } from "./ui";

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
  const [reminder, setReminder] = useState(game.reminderIntervalMin ?? 0);
  const [levels, setLevels] = useState<BlindLevel[]>(game.blindStructure);
  const [busy, setBusy] = useState(false);
  const t = useT();

  // Reset when the sheet opens — not on every live update, which would wipe unsaved edits.
  useEffect(() => {
    if (open) {
      setName(game.name);
      setReminder(game.reminderIntervalMin ?? 0);
      setLevels(game.blindStructure);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty =
    open &&
    (name !== game.name ||
      (game.chatId != null && reminder !== (game.reminderIntervalMin ?? 0)) ||
      JSON.stringify(levels) !== JSON.stringify(game.blindStructure));
  useClosingConfirmation(dirty);

  const update = (i: number, patch: Partial<BlindLevel>) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name };
      if (game.chatId) body.reminderIntervalMin = reminder;
      if (JSON.stringify(levels) !== JSON.stringify(game.blindStructure)) body.blindStructure = levels;
      await api(`/api/games/${game.id}`, "PATCH", body);
      haptic("success");
      toast(t("gs.saved"));
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const nativeSave = useMainButton(open ? { text: t("common.save"), loading: busy, disabled: !dirty, onClick: () => void save() } : null);

  return (
    <Sheet open={open} onClose={onClose} title={t("gs.title")}>
      <label className="mb-3 block">
        <span className="mb-1 block text-[13px] text-hint">{t("gs.name")}</span>
        <input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>

      {game.chatId ? (
        <div className="mb-4">
          <span className="mb-1 block text-[13px] text-hint">{t("gs.reminder")}</span>
          <div className="flex gap-2">
            {[0, 15, 30, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setReminder(m)}
                className={`flex-1 rounded-full py-2.5 text-sm font-bold ${reminder === m ? "glass-tint" : "bg-fg/6"}`}
              >
                {m ? t("common.minutes", { n: m }) : t("common.off")}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-2 flex items-center justify-between">
        <span className="px-1 text-[15px] font-bold">{t("gs.structure")}</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {(Object.keys(BLIND_TEMPLATES) as BlindTemplateId[]).map((tpl) => (
          <button
            key={tpl}
            type="button"
            className="glass rounded-full px-3.5 py-1.5 text-[13px] font-bold text-link"
            onClick={() => setLevels(buildStructure(tpl, game.startingStack))}
          >
            {t(`blinds.tpl.${tpl}`)}
          </button>
        ))}
      </div>
      <div className="mb-2 grid grid-cols-[1.5rem_1fr_1fr_1fr_3.5rem_1.5rem] items-center gap-1.5 px-1 text-[11px] text-hint">
        <span>#</span>
        <span>SB</span>
        <span>BB</span>
        <span>{t("gs.ante")}</span>
        <span>{t("gs.min")}</span>
        <span />
      </div>
      <div className="mb-3 space-y-1.5">
        {levels.map((l, i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1fr_3.5rem_1.5rem] items-center gap-1.5">
            <span className={`text-center text-xs ${i === game.blindLevel ? "font-bold text-link" : "text-hint"}`}>{i + 1}</span>
            {l.isBreak ? (
              <span className="col-span-3 rounded-lg bg-fg/5 px-2 py-2 text-sm text-hint">☕ {t("blinds.break")}</span>
            ) : (
              <>
                <input className={`${inputCls} !px-2 !py-1.5 text-sm`} inputMode="numeric" value={l.sb} onChange={(e) => update(i, { sb: num(e.target.value) })} />
                <input className={`${inputCls} !px-2 !py-1.5 text-sm`} inputMode="numeric" value={l.bb} onChange={(e) => update(i, { bb: num(e.target.value) })} />
                <input className={`${inputCls} !px-2 !py-1.5 text-sm`} inputMode="numeric" value={l.ante} onChange={(e) => update(i, { ante: num(e.target.value) })} />
              </>
            )}
            <input className={`${inputCls} !px-2 !py-1.5 text-sm`} inputMode="numeric" value={l.minutes} onChange={(e) => update(i, { minutes: num(e.target.value) })} />
            <button type="button" aria-label={t("gs.removeLevel")} className="text-danger" disabled={levels.length < 2} onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mb-1 text-xs text-hint">{t("gs.unlimited")}</div>
      <div className="mb-4 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const last = [...levels].reverse().find((l) => !l.isBreak) ?? { sb: 25, bb: 50, ante: 0, minutes: 20 };
            setLevels((ls) => [...ls, { sb: last.sb * 2, bb: last.bb * 2, ante: last.ante * 2, minutes: last.minutes }]);
          }}
        >
          {t("gs.addLevel")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLevels((ls) => [...ls, { sb: 0, bb: 0, ante: 0, minutes: 10, isBreak: true }])}>
          {t("gs.addBreak")}
        </Button>
      </div>

      {!nativeSave && (
        <Button size="lg" className="mb-2 w-full" onClick={save} loading={busy} disabled={!dirty}>
          {t("common.save")}
        </Button>
      )}
    </Sheet>
  );
}
