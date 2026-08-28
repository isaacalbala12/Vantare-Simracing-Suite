import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { NotificationSettings } from "./settings-contract";

/**
 * Notification preferences, read straight from the settings stream.
 *
 * The surfaces that obey these live outside the settings page -- the update
 * banner sits in the shell, the launcher toast in the chain provider -- so they
 * cannot receive them as props. Each subscribes to the same `settings` event
 * the page does. Emitting `settings:get` more than once is harmless: the
 * backend answers with the same snapshot.
 */
function samePreferences(a: NotificationSettings, b: NotificationSettings): boolean {
  return (
    Boolean(a.updatesMuted) === Boolean(b.updatesMuted) &&
    Boolean(a.launcherMuted) === Boolean(b.launcherMuted) &&
    Boolean(a.systemEnabled) === Boolean(b.systemEnabled)
  );
}

/** The stored setting is an opt-out: an absent value keeps update alerts on. */
export function allowsUpdateAlerts(preferences: NotificationSettings): boolean {
  return !preferences.updatesMuted;
}

export function useNotificationPreferences(): NotificationSettings {
  const [preferences, setPreferences] = useState<NotificationSettings>({});

  useEffect(() => {
    const off = Events.On("settings", (event: { data: { notifications?: NotificationSettings } }) => {
      if (!event.data || typeof event.data !== "object") {
        return;
      }
      // An absent object means the defaults, which are all-off opt-outs.
      const next = event.data.notifications ?? {};
      // Only replace state when a value actually changed. Storing the incoming
      // object unconditionally handed React a new identity on every `settings`
      // event, and one caller of this hook is ChainRunnerProvider, which wraps
      // the entire Hub: every save re-rendered the whole application.
      setPreferences((previous) => (samePreferences(previous, next) ? previous : next));
    });
    Events.Emit("settings:get");
    return () => off?.();
  }, []);

  return preferences;
}
