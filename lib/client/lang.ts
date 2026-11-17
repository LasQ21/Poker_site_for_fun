import { pickLang, type Lang } from "@/lib/i18n";
import type { LangSetting } from "./settings";

/** localStorage key of the last effective interface language (applied before anything loads). */
export const LANG_CACHE_KEY = "pt:lang";

export interface LangInputs {
  /** Settings choice (CloudStorage / localStorage). */
  setting: LangSetting;
  /** Explicit choice stored on the server (users.lang, from /api/me). */
  userLang?: Lang | null;
  /** Telegram client language: initData's language_code, else the one stored on the server. */
  telegramCode?: string | null;
  /** navigator.languages; consulted only without a Telegram language (like the server's userLang). */
  browser?: readonly (string | null | undefined)[];
}

/** Effective language: explicit setting → server-stored choice → Telegram language → browser. */
export function resolveLang({ setting, userLang, telegramCode, browser = [] }: LangInputs): Lang {
  if (setting !== "auto") return setting;
  if (userLang === "uk" || userLang === "en") return userLang;
  return telegramCode ? pickLang(telegramCode) : pickLang(...browser);
}

export function readCachedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_CACHE_KEY);
    return v === "uk" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

export function cacheLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_CACHE_KEY, lang);
  } catch {}
}
