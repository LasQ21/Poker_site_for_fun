"use client";

import { useT } from "@/lib/i18n/client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useMe } from "./AppShell";
import { Button, Section } from "./ui";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

/** Telegram Login Widget for the website (inside the Mini App the user is already known). */
export function LoginPanel({ compact }: { compact?: boolean }) {
  const { data, mutate } = useMe();
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.botUsername || !box.current) return;
    window.onTelegramAuth = async (user) => {
      try {
        await api("/api/auth/login", "POST", user);
        await mutate();
        window.location.reload();
      } catch (e) {
        setError((e as Error).message);
      }
    };
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", data.botUsername);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "12");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    s.setAttribute("data-request-access", "write");
    box.current.innerHTML = "";
    box.current.appendChild(s);
  }, [data?.botUsername, mutate]);

  async function devLogin(id: number, name: string) {
    await fetch(`/api/auth/dev?id=${id}&name=${encodeURIComponent(name)}&chat=-1001&chatTitle=${encodeURIComponent("Покер по п'ятницях")}`);
    window.location.reload();
  }

  return (
    <Section>
      <div className={`flex flex-col items-center gap-3 px-5 text-center ${compact ? "py-5" : "py-8"}`}>
        
        <div>
          <div className="font-display text-lg font-bold">{t("login.title")}</div>
          <div className="mt-1 text-sm text-hint">{t("login.text")}</div>
        </div>
        <div ref={box} className="min-h-10" />
        {!data?.botUsername && !data?.devLogin && <div className="text-xs text-hint">{t("login.notConfigured")}</div>}
        {data?.devLogin && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => devLogin(101, "Олег")}>Dev: Олег</Button>
            <Button size="sm" variant="secondary" onClick={() => devLogin(102, "Анна")}>Dev: Анна</Button>
          </div>
        )}
        {error && <div className="text-sm text-danger">{error}</div>}
      </div>
    </Section>
  );
}
