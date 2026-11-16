"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { getWebApp } from "@/lib/client/telegram";
import type { MeDTO } from "@/lib/types";
import { Toast } from "./ui";

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function useMe() {
  return useSWR<MeDTO>("/api/me", fetcher, { revalidateOnFocus: false });
}

const TABS = [
  { href: "/", label: "Ігри", icon: "🃏", match: (p: string) => p === "/" },
  { href: "/leaderboard", label: "Лідерборд", icon: "🏆", match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/history", label: "Історія", icon: "🗂", match: (p: string) => p.startsWith("/history") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<string | null>(null);
  const [miniApp, setMiniApp] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const wa = getWebApp();
    if (!wa) return;
    setMiniApp(true);
    wa.ready();
    wa.expand();
    try {
      if (wa.isVersionAtLeast("7.7")) wa.disableVerticalSwipes?.();
    } catch {}
    const applyTheme = () => {
      document.documentElement.dataset.theme = wa.colorScheme;
    };
    applyTheme();
    wa.onEvent("themeChanged", applyTheme);

    // Deep link: t.me/<bot>/<app>?startapp=<gameId> or lb_<chatPublicId>
    const sp = wa.initDataUnsafe.start_param;
    if (sp && !sessionStorage.getItem(`sp:${sp}`)) {
      sessionStorage.setItem(`sp:${sp}`, "1");
      if (sp.startsWith("lb_")) router.replace(`/leaderboard/${sp.slice(3)}`);
      else if (/^[A-Za-z0-9_-]{4,40}$/.test(sp)) router.replace(`/g/${sp}`);
    }
    return () => wa.offEvent("themeChanged", applyTheme);
  }, [router]);

  const showTabs = TABS.some((t) => t.match(pathname));

  return (
    <ToastCtx.Provider value={setToast}>
      {!miniApp && <SiteHeader />}
      <main className={`mx-auto w-full max-w-2xl px-3 pt-3 ${showTabs ? "pb-24" : "pb-10"}`}>{children}</main>
      {showTabs && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-sep bg-section/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl">
            {TABS.map((t) => {
              const active = t.match(pathname);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`flex flex-1 flex-col items-center gap-0.5 pt-2 text-[11px] font-medium ${active ? "text-link" : "text-hint"}`}
                >
                  <span className={`text-xl leading-none ${active ? "" : "grayscale opacity-70"}`}>{t.icon}</span>
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <Toast message={toast} onDone={clearToast} />
    </ToastCtx.Provider>
  );
}

function SiteHeader() {
  const { data } = useMe();
  return (
    <header className="sticky top-0 z-30 border-b border-sep bg-section/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-felt text-sm text-white">♠</span>
          Poker Tracker
        </Link>
        {data?.user && (
          <span className="flex items-center gap-2 text-sm text-hint">
            {data.user.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.user.photoUrl} alt="" className="h-6 w-6 rounded-full" />
            ) : null}
            {data.user.firstName}
          </span>
        )}
      </div>
    </header>
  );
}
