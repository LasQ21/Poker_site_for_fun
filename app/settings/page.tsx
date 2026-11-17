"use client";

import { useEffect, useState } from "react";
import { useAppBack } from "@/lib/client/nav";
import { updateSettings, useSettings } from "@/lib/client/settings";
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
import { Button, Section, Toggle } from "@/components/ui";

export default function SettingsPage() {
  const settings = useSettings();
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
      <h1 className="font-display mb-4 px-1 text-[1.6rem] font-bold">Налаштування</h1>

      <Section title="Сигнали">
        <Toggle
          label="Звук зміни рівня"
          hint="Сигнал, коли закінчується рівень блайндів"
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
          label="Вібрація"
          hint="Тактильний відгук на дії та зміну рівня"
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
              label="Повноекранний режим"
              hint="Без шапки Telegram — зручно для таймера на столі"
              checked={fullscreen}
              onChange={(v) => (v ? requestFullscreen() : exitFullscreen())}
            />
          )}
          {canAddToHomeScreen() && home !== "unsupported" && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Іконка на головному екрані</span>
                <span className="mt-0.5 block text-[13px] text-hint">
                  {home === "added" ? "Уже додано ✓" : "Відкривати трекер одним дотиком"}
                </span>
              </span>
              {home !== "added" && (
                <Button size="sm" variant="secondary" onClick={addToHomeScreen}>
                  Додати
                </Button>
              )}
            </div>
          )}
        </Section>
      )}

      <p className="px-4 text-[13px] text-hint">
        {miniApp ? "Налаштування зберігаються у вашому Telegram і синхронізуються між пристроями." : "Налаштування зберігаються в цьому браузері."}
      </p>
    </div>
  );
}
