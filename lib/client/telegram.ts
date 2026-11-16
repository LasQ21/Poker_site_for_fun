"use client";

import { useEffect } from "react";

type Haptic = "light" | "medium" | "heavy" | "rigid" | "soft";
type Notify = "error" | "success" | "warning";

interface TgButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string }; start_param?: string };
  colorScheme: "light" | "dark";
  platform: string;
  version: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  BackButton: TgButton;
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

export function haptic(kind: Haptic | Notify | "select" = "light") {
  const h = getWebApp()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === "select") h.selectionChanged();
    else if (kind === "error" || kind === "success" || kind === "warning") h.notificationOccurred(kind);
    else h.impactOccurred(kind);
  } catch {
    /* older clients */
  }
}

/** Shows Telegram's native back button while mounted (Mini App only). */
export function useBackButton(onBack: (() => void) | null) {
  useEffect(() => {
    const wa = getWebApp();
    if (!wa || !onBack || !wa.isVersionAtLeast("6.1")) return;
    wa.BackButton.onClick(onBack);
    wa.BackButton.show();
    return () => {
      wa.BackButton.offClick(onBack);
      wa.BackButton.hide();
    };
  }, [onBack]);
}

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
  const wa = getWebApp();
  if (wa?.showConfirm && wa.isVersionAtLeast("6.2")) {
    return new Promise((resolve) => wa.showConfirm!(message, resolve));
  }
  return window.confirm(message);
}
