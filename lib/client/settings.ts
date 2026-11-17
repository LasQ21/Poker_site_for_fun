"use client";

import { useSyncExternalStore } from "react";
import { mutate } from "swr";
import type { MeDTO } from "@/lib/types";
import { cloudGet, cloudSet } from "./telegram";

export type LangSetting = "auto" | "uk" | "en";

export interface Settings {
  /** Beep when the blind level changes. */
  sound: boolean;
  /** Haptic feedback / vibration. */
  vibration: boolean;
  /** Interface language; "auto" follows Telegram / the browser. */
  lang: LangSetting;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, vibration: true, lang: "auto" };

const KEY = "settings";
let current: Settings = DEFAULT_SETTINGS;
let loaded = false;
/** Settings came from storage (or were changed by the user): `current` is not just the defaults. */
let ready = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getSettings(): Settings {
  return current;
}

function parse(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof v.sound === "boolean" ? v.sound : DEFAULT_SETTINGS.sound,
      vibration: typeof v.vibration === "boolean" ? v.vibration : DEFAULT_SETTINGS.vibration,
      lang: v.lang === "uk" || v.lang === "en" || v.lang === "auto" ? v.lang : DEFAULT_SETTINGS.lang,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Loads settings from Telegram CloudStorage (synced across the user's devices) or localStorage. */
export async function loadSettings() {
  if (loaded) return current;
  loaded = true;
  current = parse(await cloudGet(KEY));
  ready = true;
  emit();
  return current;
}

export async function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  ready = true;
  emit();
  // Keep the cached /api/me in step with the language the settings page also PATCHes there.
  const lang = patch.lang;
  if (lang) {
    void mutate<MeDTO>(
      "/api/me",
      (me) => (me?.user ? { ...me, user: { ...me.user, lang: lang === "auto" ? null : lang } } : me),
      { revalidate: false },
    );
  }
  await cloudSet(KEY, JSON.stringify(current));
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => DEFAULT_SETTINGS,
  );
}

/** True once the stored settings have been loaded (until then `useSettings()` returns defaults). */
export function useSettingsReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
    () => false,
  );
}
