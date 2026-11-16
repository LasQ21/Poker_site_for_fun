"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { haptic, useBackButton } from "@/lib/client/telegram";
import { BLIND_TEMPLATES, buildStructure, formatBlinds, type BlindTemplateId } from "@/lib/game/blinds";
import { fmtChips } from "@/lib/format";
import { useMe, useToast } from "@/components/AppShell";
import { LoginPanel } from "@/components/LoginPanel";
import { Button, Field, inputCls, PageLoader, Section, Segmented } from "@/components/ui";

const STACKS = [5_000, 10_000, 20_000, 50_000];
const REMINDERS = [0, 15, 30, 45, 60];

export default function NewGamePage() {
  const router = useRouter();
  const toast = useToast();
  const { data: me, isLoading } = useMe();
  const back = useCallback(() => router.back(), [router]);
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
      <h1 className="mb-3 px-1 text-2xl font-bold">Нова гра</h1>

      <Section>
        <div className="p-3">
          <Segmented
            value={type}
            onChange={(v) => {
              setType(v);
              haptic("select");
            }}
            options={[
              { value: "tournament", label: "🏆 Турнір" },
              { value: "cash", label: "💵 Кеш" },
            ]}
          />
          <p className="mt-2 px-1 text-[13px] text-hint">
            {type === "cash"
              ? "Гравці докуповують фішки; результат — фінальний стек мінус бай-іни (у фішках і бай-інах)."
              : "Гравці вибувають, місця дають очки сезону: N − місце + 1, переможцю +2."}
          </p>
        </div>
        <Field label="Назва (необов'язково)">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "cash" ? "Кеш у Сашка" : "Турнір п'ятниці"} maxLength={80} />
        </Field>
        <Field label="Стартовий стек (фішки)">
          <div className="mb-2 flex gap-2">
            {STACKS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStack(s)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold tabular ${stack === s ? "bg-button text-button-fg" : "bg-fg/6"}`}
              >
                {fmtChips(s)}
              </button>
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
        <Section title="Блайнди">
          <div className="p-3">
            <Segmented
              value={effectiveTemplate as "turbo" | "regular" | "deep"}
              onChange={setTemplate}
              options={(["turbo", "regular", "deep"] as const).map((t) => ({ value: t, label: BLIND_TEMPLATES[t].label.split(" ")[0] }))}
            />
            <div className="mt-2 px-1 text-[13px] text-hint">
              {BLIND_TEMPLATES[effectiveTemplate].minutes} хв на рівень: {preview.map(formatBlinds).join(" → ")} → …
              <br />
              Структуру можна змінити після створення.
            </div>
          </div>
        </Section>
      )}
      {type === "cash" && (
        <Section title="Блайнди">
          <div className="px-4 py-3 text-sm">
            Фіксовані: <b>{formatBlinds(preview[0])}</b>
            <span className="text-hint"> (змінюються в налаштуваннях гри)</span>
          </div>
        </Section>
      )}

      <Section title="Група Telegram">
        {me.chats.length ? (
          <>
            <Field label="Прив'язати до групи" hint="Ігри групи потрапляють у її лідерборд; бот пише туди нагадування і зміни блайндів.">
              <select className={inputCls} value={chatId ?? ""} onChange={(e) => setChatId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Без групи</option>
                {me.chats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
            {chatId && (
              <Field label="Нагадування оновити стеки">
                <div className="flex gap-2">
                  {REMINDERS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setReminder(m)}
                      className={`flex-1 rounded-lg py-2 text-sm font-semibold ${reminder === m ? "bg-button text-button-fg" : "bg-fg/6"}`}
                    >
                      {m ? `${m} хв` : "Вимк."}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </>
        ) : (
          <div className="px-4 py-3 text-[13px] text-hint">
            Додайте бота в груповий чат і напишіть там будь-яку команду (напр. /help) — група з&apos;явиться тут.
          </div>
        )}
      </Section>

      <Section title="Гравці">
        <label className="flex items-center justify-between border-b border-sep px-4 py-3">
          <span>Я теж граю</span>
          <input type="checkbox" className="h-5 w-5 accent-[var(--app-button)]" checked={hostPlays} onChange={(e) => setHostPlays(e.target.checked)} />
        </label>
        {names.map((n, i) => (
          <div key={i} className="flex items-center justify-between border-b border-sep px-4 py-2.5">
            <span>{n}</span>
            <button type="button" className="text-sm text-danger" onClick={() => setNames((xs) => xs.filter((_, j) => j !== i))}>
              Прибрати
            </button>
          </div>
        ))}
        <div className="flex gap-2 p-3">
          <input
            className={inputCls}
            placeholder="Ім'я гравця"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addName())}
          />
          <Button variant="secondary" onClick={addName} disabled={!draft.trim()}>
            Додати
          </Button>
        </div>
        <div className="px-4 pb-3 text-[13px] text-hint">Друзі з Telegram зможуть самі «сісти» на своє місце за посиланням або командою /join.</div>
      </Section>

      <Button size="lg" className="w-full" onClick={submit} loading={busy} disabled={stack < 1}>
        Створити гру
      </Button>
    </div>
  );
}
