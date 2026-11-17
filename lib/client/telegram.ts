"use client";

import { useEffect, useRef, useState } from "react";
import { getSettings } from "./settings";

type Haptic = "light" | "medium" | "heavy" | "rigid" | "soft";
type Notify = "error" | "success" | "warning";

interface TgButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface BottomButtonParams {
  text?: string;
  color?: string;
  text_color?: string;
  is_active?: boolean;
  is_visible?: boolean;
  has_shine_effect?: boolean;
  position?: "left" | "right" | "top" | "bottom";
}

interface TgBottomButton extends TgButton {
  isVisible: boolean;
  setParams(p: BottomButtonParams): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
}

interface TgCloudStorage {
  setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
  getItem(key: string, cb: (err: string | null, value?: string) => void): void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; language_code?: string }; start_param?: string };
  colorScheme: "light" | "dark";
  platform: string;
  version: string;
  isFullscreen?: boolean;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(v: string): boolean;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  setBottomBarColor?: (c: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  lockOrientation?: () => void;
  unlockOrientation?: () => void;
  addToHomeScreen?: () => void;
  checkHomeScreenStatus?: (cb: (status: "unsupported" | "unknown" | "added" | "missed") => void) => void;
  BackButton: TgButton;
  MainButton?: TgBottomButton;
  SecondaryButton?: TgBottomButton;
  CloudStorage?: TgCloudStorage;
  HapticFeedback?: {
    impactOccurred(s: Haptic): void;
    notificationOccurred(t: Notify): void;
    selectionChanged(): void;
  };
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  showConfirm?: (msg: string, cb: (ok: boolean) => void) => void;
  onEvent(e: string, cb: () => void): void;
  offEvent(e: string, cb: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** The Mini App object, or null on the regular website (initData is empty outside Telegram). */
export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const wa = window.Telegram?.WebApp;
  return wa && wa.initData ? wa : null;
}

export function isMiniApp() {
  return getWebApp() != null;
}

/** `isMiniApp()` that is safe to use during render (false on the server and the first client render). */
export function useIsMiniApp() {
  const [mini, setMini] = useState(false);
  useEffect(() => setMini(isMiniApp()), []);
  return mini;
}

/** WebApp when it supports a given Bot API version. */
function webAppAtLeast(version: string): TelegramWebApp | null {
  const wa = getWebApp();
  return wa && wa.isVersionAtLeast(version) ? wa : null;
}

export function haptic(kind: Haptic | Notify | "select" = "light") {
  if (!getSettings().vibration) return;
  const h = getWebApp()?.HapticFeedback;
  if (h) {
    try {
      if (kind === "select") h.selectionChanged();
      else if (kind === "error" || kind === "success" || kind === "warning") h.notificationOccurred(kind);
      else h.impactOccurred(kind);
    } catch {
      /* older clients */
    }
    return;
  }
  // Website on Android: short vibration for the stronger signals only.
  if (typeof navigator !== "undefined" && "vibrate" in navigator && (kind === "heavy" || kind === "warning" || kind === "error")) {
    try {
      navigator.vibrate(kind === "warning" ? [80, 60, 80] : 60);
    } catch {}
  }
}

/** Shows Telegram's native back button while mounted (Mini App only). */
export function useBackButton(onBack: (() => void) | null) {
  useEffect(() => {
    const wa = webAppAtLeast("6.1");
    if (!wa || !onBack) return;
    wa.BackButton.onClick(onBack);
    wa.BackButton.show();
    return () => {
      wa.BackButton.offClick(onBack);
      wa.BackButton.hide();
    };
  }, [onBack]);
}

export interface BottomButtonConfig {
  text: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Hidden without unmounting the hook. */
  hidden?: boolean;
  /** SecondaryButton only. */
  position?: "left" | "right" | "top" | "bottom";
  /** Destructive look for MainButton (uses the theme's destructive color). */
  destructive?: boolean;
}

/**
 * Drives Telegram's MainButton / SecondaryButton while mounted. Returns true when the native button
 * is in use, so the component can hide its own HTML button (on the website it returns false).
 */
function useBottomButton(kind: "MainButton" | "SecondaryButton", cfg: BottomButtonConfig | null): boolean {
  const [native, setNative] = useState(false);
  const click = useRef<() => void>(() => {});
  click.current = cfg?.onClick ?? (() => {});
  const enabled = cfg != null && !cfg.hidden;

  useEffect(() => {
    const wa = webAppAtLeast(kind === "MainButton" ? "6.1" : "7.10");
    const btn = wa?.[kind];
    if (!btn || !enabled) {
      setNative(false);
      return;
    }
    const handler = () => {
      haptic("light");
      click.current();
    };
    btn.onClick(handler);
    setNative(true);
    return () => {
      btn.offClick(handler);
      try {
        btn.hideProgress();
      } catch {}
      btn.hide();
    };
  }, [kind, enabled]);

  const text = cfg?.text ?? "";
  const loading = Boolean(cfg?.loading);
  const disabled = Boolean(cfg?.disabled);
  const position = cfg?.position;
  const destructive = Boolean(cfg?.destructive);
  useEffect(() => {
    // `native` lags one render behind `enabled`; never re-show a button that was just hidden.
    if (!native || !enabled) return;
    const btn = getWebApp()?.[kind];
    if (!btn) return;
    const css = getComputedStyle(document.documentElement);
    const destructiveColor = css.getPropertyValue("--tg-theme-destructive-text-color").trim() || "#e5484d";
    btn.setParams({
      text,
      is_visible: true,
      is_active: !disabled && !loading,
      ...(kind === "SecondaryButton" && position ? { position } : {}),
      ...(destructive ? { color: destructiveColor, text_color: "#ffffff" } : {}),
    });
    if (loading) btn.showProgress(false);
    else btn.hideProgress();
  }, [native, enabled, kind, text, loading, disabled, position, destructive]);

  return native && enabled;
}

export const useMainButton = (cfg: BottomButtonConfig | null) => useBottomButton("MainButton", cfg);
export const useSecondaryButton = (cfg: BottomButtonConfig | null) => useBottomButton("SecondaryButton", cfg);

let closingGuards = 0;

/** Asks Telegram to confirm closing the Mini App while `active` (unsaved changes). */
export function useClosingConfirmation(active: boolean) {
  useEffect(() => {
    const wa = webAppAtLeast("6.2");
    if (!wa || !active) return;
    if (closingGuards++ === 0) wa.enableClosingConfirmation?.();
    return () => {
      if (--closingGuards === 0) wa.disableClosingConfirmation?.();
    };
  }, [active]);
}

// ---------------------------------------------------------------- fullscreen & home screen (Bot API 8.0)

export function canFullscreen() {
  return Boolean(webAppAtLeast("8.0")?.requestFullscreen);
}

export function isFullscreen() {
  return Boolean(getWebApp()?.isFullscreen);
}

export function requestFullscreen() {
  try {
    webAppAtLeast("8.0")?.requestFullscreen?.();
  } catch {}
}

export function exitFullscreen() {
  try {
    webAppAtLeast("8.0")?.exitFullscreen?.();
  } catch {}
}

export function canAddToHomeScreen() {
  return Boolean(webAppAtLeast("8.0")?.addToHomeScreen);
}

export function addToHomeScreen() {
  try {
    webAppAtLeast("8.0")?.addToHomeScreen?.();
  } catch {}
}

export function homeScreenStatus(): Promise<"unsupported" | "unknown" | "added" | "missed"> {
  const wa = webAppAtLeast("8.0");
  if (!wa?.checkHomeScreenStatus) return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    try {
      wa.checkHomeScreenStatus!(resolve);
    } catch {
      resolve("unsupported");
    }
  });
}

// ---------------------------------------------------------------- CloudStorage (synced per Telegram user)

const LS_PREFIX = "pt:";

/** Reads a value from Telegram CloudStorage (Mini App) or localStorage (website). */
export function cloudGet(key: string): Promise<string | null> {
  const cs = webAppAtLeast("6.9")?.CloudStorage;
  const local = () => {
    try {
      return localStorage.getItem(LS_PREFIX + key);
    } catch {
      return null;
    }
  };
  if (!cs) return Promise.resolve(local());
  return new Promise((resolve) => {
    try {
      cs.getItem(key, (err, value) => resolve(err ? local() : value || local()));
    } catch {
      resolve(local());
    }
  });
}

/** Writes to CloudStorage (Mini App) and always mirrors to localStorage. */
export function cloudSet(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(LS_PREFIX + key, value);
  } catch {}
  const cs = webAppAtLeast("6.9")?.CloudStorage;
  if (!cs) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      cs.setItem(key, value, () => resolve());
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------- misc

export function openExternal(url: string) {
  const wa = getWebApp();
  if (!wa) {
    window.open(url, "_blank", "noopener");
    return;
  }
  if (/^https:\/\/t\.me\//.test(url)) wa.openTelegramLink(url);
  else wa.openLink(url);
}

export async function confirmDialog(message: string): Promise<boolean> {
  const wa = webAppAtLeast("6.2");
  if (wa?.showConfirm) {
    return new Promise((resolve) => wa.showConfirm!(message, resolve));
  }
  return window.confirm(message);
}

export function closeMiniApp() {
  try {
    getWebApp()?.close();
  } catch {}
}
