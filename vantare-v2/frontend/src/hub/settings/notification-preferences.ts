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
export function useNotificationPreferences(): NotificationSettings {
  const [preferences, setPreferences] = useState<NotificationSettings>({});

  useEffect(() => {
    const off = Events.On("settings", (event: { data: { notifications?: NotificationSettings } }) => {
      if (event.data && typeof event.data === "object") {
        // An absent object means the defaults, which are all-off opt-outs.
        setPreferences(event.data.notifications ?? {});
      }
    });
    Events.Emit("settings:get");
    return () => off?.();
  }, []);

  return preferences;
}

/**
 * Whether a desktop notification can actually be raised right now.
 *
 * Vantare never asked for permission, so notifyLaunchResult could never fire:
 * its permission check was against a permission nobody had requested. This is
 * the honest answer to "can we", and it is what the settings toggle keys off so
 * it cannot offer something the platform will refuse.
 */
export function systemNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Asks the operating system, once, when the user turns the setting on.
 * Resolves to whether a notification can now be raised.
 */
export async function requestSystemNotifications(): Promise<boolean> {
  if (typeof Notification === "undefined") {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission === "denied") {
    // Only the user can undo this, from the system settings.
    return false;
  }
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
