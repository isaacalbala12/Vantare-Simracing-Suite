import { Events } from "@wailsio/runtime";
import type { AppSettings } from "./settings-contract";

/**
 * Fanout único del canal `settings` / `settings-saved` (ISA-1143 / issue
 * #1147, fase 1).
 *
 * `settings` se suscribía desde cinco puntos (useAppSettings,
 * notification-preferences, use-overlay-state, StudioRoute y HubShell), cada
 * uno con su propio `Events.On` de Wails y su propio closure. Este módulo
 * instala una única suscripción por evento cuando llega el primer listener,
 * reparte el payload ya desenvuelto (`event.data`) a todos los suscriptores
 * y la retira cuando se va el último. Es el mismo patrón que
 * `hub/launcher/launcher-bridge.ts`.
 *
 * La guarda "el payload es un objeto" vive aquí una sola vez: antes la
 * repetían useAppSettings y notification-preferences.
 */

export type Unsubscribe = () => void;

export type SettingsListener = (settings: AppSettings) => void;

/** Confirmación del backend tras `settings:save`; `requestId` correlaciona. */
export type SettingsSavedPayload = {
  requestId?: string;
  settings?: AppSettings;
};

export type SettingsSavedListener = (payload: SettingsSavedPayload | undefined) => void;

const settingsListeners = new Set<SettingsListener>();
const savedListeners = new Set<SettingsSavedListener>();
let wailsSettingsUnsubscribe: Unsubscribe | null = null;
let wailsSavedUnsubscribe: Unsubscribe | null = null;

function ensureSettingsListener(): void {
  if (wailsSettingsUnsubscribe) return;
  wailsSettingsUnsubscribe = Events.On("settings", (event: unknown) => {
    const data = (event as { data?: AppSettings } | undefined)?.data;
    if (!data || typeof data !== "object") return;
    settingsListeners.forEach((listener) => listener(data));
  });
}

function ensureSavedListener(): void {
  if (wailsSavedUnsubscribe) return;
  wailsSavedUnsubscribe = Events.On("settings-saved", (event: unknown) => {
    const data = (event as { data?: SettingsSavedPayload } | undefined)?.data;
    savedListeners.forEach((listener) => listener(data));
  });
}

export function subscribeSettings(listener: SettingsListener): Unsubscribe {
  ensureSettingsListener();
  settingsListeners.add(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    settingsListeners.delete(listener);
    if (settingsListeners.size === 0) {
      wailsSettingsUnsubscribe?.();
      wailsSettingsUnsubscribe = null;
    }
  };
}

export function subscribeSettingsSaved(listener: SettingsSavedListener): Unsubscribe {
  ensureSavedListener();
  savedListeners.add(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    savedListeners.delete(listener);
    if (savedListeners.size === 0) {
      wailsSavedUnsubscribe?.();
      wailsSavedUnsubscribe = null;
    }
  };
}

export function requestSettings(): void {
  Events.Emit("settings:get");
}

export function saveSettings(payload: { requestId: string; settings: AppSettings }): void {
  Events.Emit("settings:save", payload);
}
