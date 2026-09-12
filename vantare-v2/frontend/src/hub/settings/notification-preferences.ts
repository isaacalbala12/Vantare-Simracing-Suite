import { useEffect, useSyncExternalStore } from "react";
import { getSettingsStore } from "./settings-store";
import type { NotificationSettings } from "./settings-contract";

/**
 * Notification preferences, read straight from the settings stream.
 *
 * The surfaces that obey these live outside the settings page -- the update
 * banner sits in the shell, the launcher toast in the chain provider -- so they
 * cannot receive them as props. Each subscribes to the shared settings store,
 * which holds the app's single `settings` subscription; emitting
 * `settings:get` more than once is harmless because the backend answers with
 * the same snapshot.
 *
 * The store only publishes the slice when a value actually changed: storing
 * the incoming object unconditionally handed React a new identity on every
 * `settings` event, and one caller of this hook is ChainRunnerProvider, which
 * wraps the entire Hub -- every save re-rendered the whole application.
 */

/** The stored setting is an opt-out: an absent value keeps update alerts on. */
export function allowsUpdateAlerts(preferences: NotificationSettings): boolean {
  return !preferences.updatesMuted;
}

export function useNotificationPreferences(): NotificationSettings {
  const store = getSettingsStore();
  useEffect(() => {
    store.requestSettings();
  }, [store]);
  return useSyncExternalStore(
    store.subscribeNotificationPreferences,
    store.getNotificationPreferences,
    store.getNotificationPreferences,
  );
}
