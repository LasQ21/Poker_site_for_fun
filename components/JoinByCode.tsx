"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { haptic } from "@/lib/client/telegram";
import { useToast } from "./AppShell";
import { Spinner } from "./ui";

type JoinResult = { gameId: string; status: "joined" | "already" | "choose-seat" };

export async function joinWithCode(code: string): Promise<JoinResult> {
  return api<JoinResult>("/api/join", "POST", { code });
}

export function joinMessage(r: JoinResult) {
  return r.status === "joined" ? "Ви за столом!" : r.status === "already" ? "Ви вже в цій грі" : "Оберіть своє місце";
}

/** Four-digit code entry; submits as soon as the fourth digit is typed. */
export function JoinByCode() {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(c: string) {
    setBusy(true);
    setError(false);
    try {
      const r = await joinWithCode(c);
      haptic("success");
      toast(joinMessage(r));
      router.push(`/g/${r.gameId}`);
    } catch (e) {
      haptic("error");
      setError(true);
      toast((e as Error).message);
      setCode("");
      setBusy(false);
      input.current?.focus();
    }
  }

  return (
    <div className="glass mb-5 rounded-[28px] px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <span className="font-bold">Є код гри?</span>
        <span className="text-[13px] font-medium text-hint">його показує хост</span>
      </div>
      <label className="relative block cursor-text" onClick={() => input.current?.focus()}>
        <span className="sr-only">Код гри з 4 цифр</span>
        <input
          ref={input}
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{4}"
          maxLength={4}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            setCode(v);
            setError(false);
            if (v.length === 4) submit(v);
          }}
          className="absolute inset-0 h-full w-full opacity-0"
        />
        <span className="grid grid-cols-4 gap-2.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => {
            const ch = code[i];
            const focused = !busy && i === Math.min(code.length, 3);
            return (
              <span
                key={i}
                className={`grid h-16 place-items-center rounded-[20px] bg-fg/6 font-display text-3xl font-bold tabular ring-inset transition ${
                  error ? "ring-2 ring-neg/60" : focused ? "ring-2 ring-link/50" : "ring-1 ring-fg/5"
                }`}
              >
                {busy && i === 3 ? <Spinner small /> : (ch ?? <span className="text-hint/40">·</span>)}
              </span>
            );
          })}
        </span>
      </label>
    </div>
  );
}
