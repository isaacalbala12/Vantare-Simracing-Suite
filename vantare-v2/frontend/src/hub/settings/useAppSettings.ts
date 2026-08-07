import { useCallback, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { parseKeyEvent } from "./hotkey-capture";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "./settings-contract";

/**
 * The persisted app settings plus the hotkey capture loop. Capture lives here
 * because it mutates the same object it saves: keeping it beside the state
 * avoids passing a setter down into the hotkeys section.
 */
/**
 * Saving is reported as a state, not as a sentence. The hook used to hold the
 * Spanish copy itself, which left two strings outside the dictionaries after
 * the page was translated; the component that shows the status is the one that
 * knows the user's language.
 */
export type SettingsSaveStatus = "saving" | "saved" | null;

export function useAppSettings() {
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsStatus, setSettingsStatus] = useState<SettingsSaveStatus>(null);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);

  useEffect(() => {
    const handlers: (() => void)[] = [];

    handlers.push(
      // The old guard probed event.data.deltaMode for truthiness, so it doubled
      // as "is this a real payload". With that field gone the check has to say
      // what it means: accept any settings object.
      Events.On("settings", (event: { data: AppSettings }) => {
        if (event.data && typeof event.data === "object") setAppSettings(event.data);
      }),
    );

    handlers.push(
      Events.On("settings-saved", () => {
        setSettingsStatus("saved");
        setTimeout(() => setSettingsStatus(null), 3000);
      }),
    );

    Events.Emit("settings:get");

    return () => {
      handlers.forEach((h) => h?.());
    };
  }, []);

  function save(next: AppSettings) {
    setAppSettings(next);
    setSettingsStatus("saving");
    Events.Emit("settings:save", next);
  }

  function toggleCpuSampling() {
    save({ ...appSettings, cpuSampling: !appSettings.cpuSampling });
  }

  // Hotkeys are edited locally and written only when the user saves, so this
  // updates state without emitting.
  const captureKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!capturingKey) return;
      event.preventDefault();
      event.stopPropagation();

      const result = parseKeyEvent(event);
      if (result.isCancel) {
        setCapturingKey(null);
        return;
      }
      if (result.combo === null) return;

      setAppSettings({
        ...appSettings,
        hotkeys: { ...appSettings.hotkeys, [capturingKey]: result.combo },
      });
      setCapturingKey(null);
    },
    [capturingKey, appSettings],
  );

  useEffect(() => {
    if (!capturingKey) return;
    document.addEventListener("keydown", captureKeyDown, true);
    return () => document.removeEventListener("keydown", captureKeyDown, true);
  }, [capturingKey, captureKeyDown]);

  function saveHotkeys() {
    setSettingsStatus("saving");
    Events.Emit("settings:save", appSettings);
  }

  return {
    appSettings,
    settingsStatus,
    capturingKey,
    startCapture: (name: string) => setCapturingKey(name),
    cancelCapture: () => setCapturingKey(null),
    toggleCpuSampling,
    saveHotkeys,
  };
}
