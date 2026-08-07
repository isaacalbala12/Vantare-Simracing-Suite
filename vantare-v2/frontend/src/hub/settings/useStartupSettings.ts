import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

/**
 * Whether Vantare launches itself when the user signs in.
 *
 * There is no local copy of this: the Windows Run key is the source of truth,
 * and every write is followed by a re-read from the backend. The user can turn
 * autostart off from Task Manager at any time, so a value we remembered here
 * would go stale without anyone noticing.
 */
export type StartupOptions = {
  enabled: boolean;
  minimised: boolean;
  supported: boolean;
};

const UNKNOWN: StartupOptions = { enabled: false, minimised: false, supported: false };

export function useStartupSettings() {
  const [startup, setStartup] = useState<StartupOptions>(UNKNOWN);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handlers: (() => void)[] = [];

    handlers.push(
      Events.On("startup", (event: { data: StartupOptions }) => {
        if (event.data && typeof event.data === "object") {
          setStartup(event.data);
          setError(null);
        }
      }),
    );

    handlers.push(
      Events.On("startup:error", (event: { data: { message?: string } }) => {
        setError(event.data?.message ?? "");
      }),
    );

    Events.Emit("startup:get");

    return () => {
      handlers.forEach((handler) => handler?.());
    };
  }, []);

  function apply(next: Partial<StartupOptions>) {
    const merged = { ...startup, ...next };
    // Not applied locally first: the backend answers with what the registry
    // really says, and a failed write must not leave the toggle looking on.
    Events.Emit("startup:set", { enabled: merged.enabled, minimised: merged.minimised });
  }

  return {
    startup,
    error,
    setEnabled: (enabled: boolean) => apply({ enabled }),
    setMinimised: (minimised: boolean) => apply({ minimised }),
  };
}
