import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

/**
 * What the platform says about desktop notifications.
 *
 * The answer comes from Go, which reaches the operating system through the
 * Wails notifications service. The browser Notification API cannot be used
 * here: WebView2 does not wire it up, so asking it for permission did nothing
 * at all.
 */
export type SystemNotificationStatus = {
  /** Whether this build can raise notifications at all. */
  supported: boolean;
  /** Whether the platform currently allows them. */
  authorized: boolean;
};

const UNKNOWN: SystemNotificationStatus = { supported: false, authorized: false };

export function useSystemNotifications() {
  const [status, setStatus] = useState<SystemNotificationStatus>(UNKNOWN);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const off = Events.On("notifications:status", (event: { data: SystemNotificationStatus }) => {
      if (event.data && typeof event.data === "object") {
        setStatus({
          supported: Boolean(event.data.supported),
          authorized: Boolean(event.data.authorized),
        });
      }
    });
    Events.Emit("notifications:status:get");
    return () => off?.();
  }, []);

  return {
    status,
    /** True once we have asked and the platform still says no. */
    refused: asked && status.supported && !status.authorized,
    authorize: () => {
      setAsked(true);
      // The backend answers with notifications:status either way, so what
      // lands in state is what the platform really allows, never what was
      // requested.
      Events.Emit("notifications:authorize");
    },
  };
}
