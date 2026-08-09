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

/** The outcome of the last test notification, if one has been sent. */
export type SystemNotificationTest =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent" }
  | { state: "failed"; message: string };

const UNKNOWN: SystemNotificationStatus = { supported: false, authorized: false };

export function useSystemNotifications() {
  const [status, setStatus] = useState<SystemNotificationStatus>(UNKNOWN);
  const [test, setTest] = useState<SystemNotificationTest>({ state: "idle" });

  useEffect(() => {
    const handlers: (() => void)[] = [];

    handlers.push(
      Events.On("notifications:status", (event: { data: SystemNotificationStatus }) => {
        if (event.data && typeof event.data === "object") {
          setStatus({
            supported: Boolean(event.data.supported),
            authorized: Boolean(event.data.authorized),
          });
        }
      }),
    );

    handlers.push(
      Events.On(
        "notifications:test:result",
        (event: { data: { ok?: boolean; message?: string } }) => {
          setTest(
            event.data?.ok
              ? { state: "sent" }
              : { state: "failed", message: event.data?.message ?? "" },
          );
        },
      ),
    );

    Events.Emit("notifications:status:get");

    return () => handlers.forEach((handler) => handler?.());
  }, []);

  return {
    status,
    test,
    authorize: () => {
      // On Windows there is no permission to grant: the platform notifier
      // answers yes unconditionally, because per-app permission is a browser
      // concept. Kept so a platform that does prompt can, and so the answer
      // always comes back from the backend rather than from us.
      Events.Emit("notifications:authorize");
    },
    sendTest: () => {
      setTest({ state: "sending" });
      Events.Emit("notifications:test");
    },
  };
}
