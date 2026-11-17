"use client";

import { useEffect, useState } from "react";
import { useAppBack } from "@/lib/client/nav";
import { api } from "@/lib/client/api";
import { updateSettings, useSettings, type LangSetting } from "@/lib/client/settings";
import { useT } from "@/lib/i18n/client";
import {
  addToHomeScreen,
  canAddToHomeScreen,
  canFullscreen,
  exitFullscreen,
  getWebApp,
  haptic,
  homeScreenStatus,
  isFullscreen,
  requestFullscreen,
  useBackButton,
  useIsMiniApp,
} from "@/lib/client/telegram";
import { beep, unlockAudio } from "@/lib/client/timer";
import { useMe } from "@/components/AppShell";
import { Button, Section, Segmented, Toggle } from "@/components/ui";

export default function SettingsPage() {
  const settings = useSettings();
  const t = useT();
  const { data: me } = useMe();
  const miniApp = useIsMiniApp();
  const back = useAppBack("/");
  useBackButton(back);

  const [fullscreen, setFullscreen] = useState(false);
  const [home, setHome] = useState<"unsupported" | "unknown" | "added" | "missed">("unsupported");
  useEffect(() => {
    if (!miniApp) return;
    setFullscreen(isFullscreen());
    void homeScreenStatus().then(setHome);
    const wa = getWebApp();
    const onFs = () => setFullscreen(isFullscreen());
    wa?.onEvent("fullscreenChanged", onFs);
    const onHome = () => void homeScreenStatus().then(setHome);
    wa?.onEvent("homeScreenAdded", onHome);
    return () => {
      wa?.offEvent("fullscreenChanged", onFs);
      wa?.offEvent("homeScreenAdded", onHome);
    };
  }, [miniApp]);

  return (
    <div>
      <h1 className="font-display mb-4 px-1 text-[1.6rem] font-bold">{t("settings.title")}</h1>

      <Section title={t("settings.language")}>
        <div className="p-3">
          <Segmented<LangSetting>
            value={settings.lang}
            onChange={(lang) => {
              void updateSettings({ lang });
              // The server uses it for the bot's group messages in games this user hosts.
              if (me?.user) void api("/api/me", "PATCH", { lang: lang === "auto" ? null : lang }).catch(() => {});
            }}
            options={[
              { value: "auto", label: t("settings.langAuto") },
              { value: "uk", label: t("lang.uk") },
              { value: "en", label: t("lang.en") },
            ]}
          />
          <p className="mt-2 px-1 text-[13px] text-hint">{t("settings.langHint")}</p>
        </div>
      </Section>

      <Section title={t("settings.signals")}>
        <Toggle
          label={t("settings.sound")}
          hint={t("settings.soundHint")}
          checked={settings.sound}
          onChange={(v) => {
            void updateSettings({ sound: v });
            if (v) {
              unlockAudio();
              beep();
            }
          }}
        />
        <Toggle
          label={t("settings.vibration")}
          hint={t("settings.vibrationHint")}
          checked={settings.vibration}
          onChange={(v) => {
            void updateSettings({ vibration: v }).then(() => v && haptic("success"));
          }}
        />
      </Section>

      {miniApp && (canFullscreen() || canAddToHomeScreen()) && (
        <Section title="Telegram">
          {canFullscreen() && (
            <Toggle
              label={t("settings.fullscreen")}
              hint={t("settings.fullscreenHint")}
              checked={fullscreen}
              onChange={(v) => (v ? requestFullscreen() : exitFullscreen())}
            />
          )}
          {canAddToHomeScreen() && home !== "unsupported" && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t("settings.homeScreen")}</span>
                <span className="mt-0.5 block text-[13px] text-hint">{t(home === "added" ? "settings.homeAdded" : "settings.homeHint")}</span>
              </span>
              {home !== "added" && (
                <Button size="sm" variant="secondary" onClick={addToHomeScreen}>
                  {t("common.add")}
                </Button>
              )}
            </div>
          )}
        </Section>
      )}

      <p className="px-4 text-[13px] text-hint">
        {t(miniApp ? "settings.storedCloud" : "settings.storedLocal")}
      </p>
    </div>
  );
}
