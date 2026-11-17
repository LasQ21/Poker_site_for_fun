"use client";

import { useT } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { haptic, useBackButton, useMainButton } from "@/lib/client/telegram";
import { useAppBack } from "@/lib/client/nav";
import { BLIND_TEMPLATES, buildStructure, formatBlinds, type BlindTemplateId } from "@/lib/game/blinds";
import { fmtChips } from "@/lib/format";
import { useMe, useToast } from "@/components/AppShell";
import { LoginPanel } from "@/components/LoginPanel";
import { Button, Choice, Field, inputCls, PageLoader, Section, Segmented } from "@/components/ui";

const STACKS = [5_000, 10_000, 20_000, 50_000];
const REMINDERS = [0, 15, 30, 45, 60];

export default function NewGamePage() {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { data: me, isLoading } = useMe();
  const back = useAppBack("/");
  useBackButton(back);

  const [type, setType] = useState<"cash" | "tournament">("tournament");
  const [name, setName] = useState("");
  const [stack, setStack] = useState(10_000);
  const [template, setTemplate] = useState<BlindTemplateId>("regular");
  const [reminder, setReminder] = useState(30);
  const [chatId, setChatId] = useState<number | null>(null);
  const [hostPlays, setHostPlays] = useState(true);
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveTemplate: BlindTemplateId = type === "cash" ? "cash" : template === "cash" ? "regular" : template;
  const preview = useMemo(() => buildStructure(effectiveTemplate, stack).filter((l) => !l.isBreak).slice(0, 4), [effectiveTemplate, stack]);

  const nativeCreate = useMainButton(
    me?.user ? { text: t(type === "cash" ? "new.createCash" : "new.createTournament"), loading: busy, disabled: stack < 1, onClick: () => void submit() } : null,
  );

  if (isLoading) return <PageLoader />;
  if (!me?.user) return <LoginPanel />;

  const addName = () => {
    const n = draft.trim();
    if (!n) return;
    setNames((xs) => [...xs, n]);
    setDraft("");
    haptic("select");
  };

  async function submit() {
    setBusy(true);
    try {
      const all = draft.trim() ? [...names, draft.trim()] : names;
      const { game } = await api<{ game: { id: string } }>("/api/games", "POST", {
        type,
        name: name || undefined,
        startingStack: stack,
        blindTemplate: effectiveTemplate,
        reminderIntervalMin: chatId ? reminder : 0,
        chatId,
        hostPlays,
        playerNames: all,
      });
      haptic("success");
      router.replace(`/g/${game.id}`);
    } catch (e) {
      haptic("error");
      toast((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display mb-4 px-1 text-2xl font-bold">{t("new.title")}</h1>

      <Section>
        <div className="p-3">
          <Segmented
            value={type}
            onChange={(v) => {
              setType(v);
              haptic("select");
            }}
            options={[
              { value: "tournament", label: t("common.tournament") },
              { value: "cash", label: t("common.cash") },
            ]}
          />
          <p className="mt-2 px-1 text-[13px] text-hint">
            {t(type === "cash" ? "new.cashHint" : "new.tournamentHint")}
          </p>
        </div>
        <Field label={t("new.nameLabel")}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t(type === "cash" ? "new.namePhCash" : "new.namePhTournament")} maxLength={80} />
        </Field>
        <Field label={t("new.stackLabel")}>
          <div className="mb-2 flex gap-2">
            {STACKS.map((s) => (
              <Choice key={s} active={stack === s} onClick={() => setStack(s)}>
                {fmtChips(s)}
              </Choice>
            ))}
          </div>
          <input
            className={inputCls}
            inputMode="numeric"
            value={stack || ""}
            onChange={(e) => setStack(Number(e.target.value.replace(/\D/g, "")) || 0)}
          />
        </Field>
      </Section>

      {type === "tournament" && (
        <Section title={t("new.blinds")}>
          <div className="p-3">
            <Segmented
              value={effectiveTemplate as "turbo" | "regular" | "deep"}
              onChange={setTemplate}
              options={(["turbo", "regular", "deep"] as const).map((tpl) => ({ value: tpl, label: t(`blinds.tplShort.${tpl}`) }))}
            />
            <div className="mt-2 px-1 text-[13px] text-hint">
              {t("new.blindsPreview", { min: BLIND_TEMPLATES[effectiveTemplate].minutes, levels: preview.map((l) => formatBlinds(l)).join(" → ") })}
              <br />
              {t("new.blindsEditLater")}
            </div>
          </div>
        </Section>
      )}
      {type === "cash" && (
        <Section title={t("new.blinds")}>
          <div className="px-4 py-3 text-sm">
            {t("new.fixed")} <b>{formatBlinds(preview[0])}</b>
            <span className="text-hint">{t("new.fixedHint")}</span>
          </div>
        </Section>
      )}

      <Section title={t("new.group")}>
        {me.chats.length ? (
          <>
            <Field label={t("new.linkGroup")} hint={t("new.linkGroupHint")}>
              <select className={inputCls} value={chatId ?? ""} onChange={(e) => setChatId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t("new.noGroup")}</option>
                {me.chats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
            {chatId && (
              <Field label={t("new.reminder")}>
                <div className="flex gap-2">
                  {REMINDERS.map((m) => (
                    <Choice key={m} active={reminder === m} onClick={() => setReminder(m)}>
                      {m ? t("common.minutes", { n: m }) : t("common.off")}
                    </Choice>
                  ))}
                </div>
              </Field>
            )}
          </>
        ) : (
          <div className="px-4 py-3 text-[13px] text-hint">
            {t("new.noGroupsHint")}
          </div>
        )}
      </Section>

      <Section title={t("new.players")}>
        <label className="flex items-center justify-between border-b border-sep px-4 py-3">
          <span>{t("new.iPlay")}</span>
          <input type="checkbox" className="h-5 w-5 accent-[var(--app-button)]" checked={hostPlays} onChange={(e) => setHostPlays(e.target.checked)} />
        </label>
        {names.map((n, i) => (
          <div key={i} className="flex items-center justify-between border-b border-sep px-4 py-2.5">
            <span>{n}</span>
            <button type="button" className="text-sm text-danger" onClick={() => setNames((xs) => xs.filter((_, j) => j !== i))}>
              {t("new.remove")}
            </button>
          </div>
        ))}
        <div className="flex gap-2 p-3">
          <input
            className={inputCls}
            placeholder={t("new.playerName")}
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addName())}
          />
          <Button variant="secondary" onClick={addName} disabled={!draft.trim()}>
            {t("common.add")}
          </Button>
        </div>
        <div className="px-4 pb-3 text-[13px] text-hint">{t("new.friendsHint")}</div>
      </Section>

      {!nativeCreate && (
        <Button size="lg" className="w-full" onClick={submit} loading={busy} disabled={stack < 1}>
          {t("new.create")}
        </Button>
      )}
    </div>
  );
}
