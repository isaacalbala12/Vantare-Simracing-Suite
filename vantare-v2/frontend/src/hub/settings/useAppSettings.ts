import { useCallback, useEffect, useRef, useState } from "react";
import { parseKeyEvent } from "./hotkey-capture";
import { getSettingsStore } from "./settings-store";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type NotificationSettings,
  type PerformanceSettings,
} from "./settings-contract";

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

// The old guard probed event.data.deltaMode for truthiness, so it doubled
// as "is this a real payload". With that field gone the check has to say
// what it means: accept any settings object (the shared channel already
// drops non-object payloads before they reach the store).
function mergeWithDefaults(data: AppSettings): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...data,
    hotkeys: { ...DEFAULT_APP_SETTINGS.hotkeys, ...(data.hotkeys ?? {}) },
  };
}

export function useAppSettings() {
  const store = getSettingsStore();
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsStatus, setSettingsStatus] = useState<SettingsSaveStatus>(null);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const pendingRequest = useRef<string | null>(null);
  const statusTimer = useRef<number | null>(null);

  // Go marshala un mapa nil como `null`, y un payload antiguo puede no traer
  // `hotkeys` en absoluto. Sustituir el objeto entero dejaba las cuatro
  // combinaciones en blanco y la pantalla decía «sin asignar» sobre atajos
  // que el backend sigue registrando. Las que falten se rellenan con el
  // contrato; las que vengan mandan.
  //
  // setState dentro del callback de suscripcion (no en el cuerpo del efecto):
  // es la forma que pide la regla de hooks para sincronizar sistemas externos.
  useEffect(() => {
    const offSettings = store.subscribe(() => {
      const next = store.getSnapshot();
      if (next) {
        setAppSettings(mergeWithDefaults(next));
      }
    });
    const offSaved = store.subscribeSettingsSaved(() => {
      const payload = store.getSettingsSaved();
      if (!payload?.requestId || payload.requestId !== pendingRequest.current) return;
      pendingRequest.current = null;
      if (payload.settings) {
        setAppSettings(mergeWithDefaults(payload.settings));
      }
      setSettingsStatus("saved");
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setSettingsStatus(null), 3000);
    });
    store.requestSettings();
    return () => {
      offSettings();
      offSaved();
      if (statusTimer.current !== null) {
        window.clearTimeout(statusTimer.current);
        statusTimer.current = null;
      }
    };
  }, [store]);

  const save = useCallback(
    (next: AppSettings) => {
      requestSequence.current += 1;
      const requestId = `settings-${requestSequence.current.toString(36)}`;
      pendingRequest.current = requestId;
      setAppSettings(next);
      setSettingsStatus("saving");
      store.saveSettings({ requestId, settings: next });
    },
    [store],
  );

  function toggleCpuSampling() {
    save({ ...appSettings, cpuSampling: !appSettings.cpuSampling });
  }

  function setPerformance(performance: PerformanceSettings) {
    save({ ...appSettings, performance });
  }

  // Merged, not replaced: each switch writes only its own key, so turning one
  // off cannot quietly reset the others.
  function setNotifications(patch: Partial<NotificationSettings>) {
    save({
      ...appSettings,
      notifications: { ...(appSettings.notifications ?? {}), ...patch },
    });
  }

  // Grabar una combinación es una decisión completa, no una edición a medias:
  // se guarda en el mismo gesto, igual que el resto de ajustes de la pantalla,
  // que ya no tienen botón de guardar.
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

      save({
        ...appSettings,
        hotkeys: { ...appSettings.hotkeys, [capturingKey]: result.combo },
      });
      setCapturingKey(null);
    },
    [capturingKey, appSettings, save],
  );

  useEffect(() => {
    if (!capturingKey) return;
    document.addEventListener("keydown", captureKeyDown, true);
    return () => document.removeEventListener("keydown", captureKeyDown, true);
  }, [capturingKey, captureKeyDown]);

  // Restablecer sí escribe: no es una edición a medias que el usuario todavía
  // esté componiendo, es una decisión completa sobre las cuatro teclas.
  function resetHotkeys() {
    setCapturingKey(null);
    save({ ...appSettings, hotkeys: { ...DEFAULT_APP_SETTINGS.hotkeys } });
  }

  return {
    appSettings,
    settingsStatus,
    capturingKey,
    startCapture: (name: string) => setCapturingKey(name),
    cancelCapture: () => setCapturingKey(null),
    toggleCpuSampling,
    setPerformance,
    setNotifications,
    resetHotkeys,
  };
}
