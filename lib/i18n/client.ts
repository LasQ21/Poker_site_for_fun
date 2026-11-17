"use client";

import { useMemo, useSyncExternalStore } from "react";
import { setFormatLang } from "@/lib/format";
import { DEFAULT_LANG, translate, type Key, type Lang, type Params, type T } from "./index";

let current: Lang = DEFAULT_LANG;
const listeners = new Set<() => void>();

/** Switches the interface language (AppShell decides which one; see lib/i18n pickLang). */
export function setClientLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  setFormatLang(lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  for (const l of listeners) l();
}

export function getClientLang(): Lang {
  return current;
}

/** Translation outside React components (event handlers, helpers). */
export function tr(key: Key, params?: Params) {
  return translate(current, key, params);
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => DEFAULT_LANG,
  );
}

/** `t(key, params)` bound to the current language; components re-render when it changes. */
export function useT(): T & { lang: Lang } {
  const lang = useLang();
  return useMemo(() => Object.assign((key: Key, params?: Params) => translate(lang, key, params), { lang }), [lang]);
}
