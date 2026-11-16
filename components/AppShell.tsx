"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { getWebApp } from "@/lib/client/telegram";
import type { MeDTO } from "@/lib/types";
import { IconCards, IconHistory, IconTrophy } from "./icons";
import { Toast } from "./ui";

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function useMe() {
  return useSWR<MeDTO>("/api/me", fetcher, { revalidateOnFocus: false });
}

const TABS = [
  { href: "/", label: "Ігри", Icon: IconCards, match: (p: string) => p === "/" },
  { href: "/leaderboard", label: "Рейтинг", Icon: IconTrophy, match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/history", label: "Історія", Icon: IconHistory, match: (p: string) => p.startsWith("/history") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<string | null>(null);
  const [miniApp, setMiniApp] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    // Real refraction only where backdrop-filter:url() works (Chromium, not iOS WebKit).
    const ua = navigator.userAgent;
    if (/Chrome\/|Chromium\//.test(ua) && !/iPhone|iPad|iPod|Version\/[\d.]+ Safari/.test(ua)) {
      document.documentElement.classList.add("refract");
    }

    const wa = getWebApp();
    if (!wa) return;
    setMiniApp(true);
    wa.ready();
    wa.expand();
    try {
      if (wa.isVersionAtLeast("6.1")) {
        wa.setHeaderColor?.("bg_color");
        wa.setBackgroundColor?.("bg_color");
      }
      if (wa.isVersionAtLeast("7.10")) wa.setBottomBarColor?.("bg_color");
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
      <main
        className={`mx-auto w-full max-w-xl px-3 ${showTabs ? "pb-32" : "pb-12"}`}
        style={{ paddingTop: miniApp ? "calc(var(--safe-top) + 12px)" : 12 }}
      >
        {children}
      </main>
      {showTabs && (
        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4" style={{ paddingBottom: "max(14px, var(--safe-bottom))" }}>
          <div className="glass-pill pointer-events-auto flex w-full max-w-sm gap-1 rounded-full p-1.5">
            {TABS.map(({ href, label, Icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-bold transition-colors ${
                    active ? "glass-strong text-link" : "text-hint"
                  }`}
                >
                  <Icon width={22} height={22} />
                  {label}
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
    <header className="sticky top-0 z-30 px-3 pt-3">
      <div className="glass mx-auto flex h-14 max-w-xl items-center justify-between rounded-full pl-2 pr-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="chip grid h-10 w-10 place-items-center text-white" style={{ ["--chip" as string]: "var(--felt)" }}>
            <span className="relative z-10 text-sm">♠</span>
          </span>
          <span className="font-display text-[15px] font-bold">Poker Tracker</span>
        </Link>
        {data?.user && (
          <span className="flex items-center gap-2 text-sm font-semibold text-hint">
            {data.user.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.user.photoUrl} alt="" className="h-7 w-7 rounded-full" />
            ) : null}
            {data.user.firstName}
          </span>
        )}
      </div>
    </header>
  );
}
