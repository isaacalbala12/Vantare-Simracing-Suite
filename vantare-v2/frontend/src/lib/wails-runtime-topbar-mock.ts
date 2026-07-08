/**
 * Wails runtime mock for the Topbar visual harness.
 * Same auto-responses as wails-runtime-mock, but license:validate resolves to
 * an anonymous (free) user so the Topbar shows the gated/premium sections as
 * locked — the layout case we want to verify (narrow screens cutting "Ajustes").
 */
import { mockCalendar } from "../hub/calendar-visual-mock-data";

const listeners = new Map<string, Set<(event: unknown) => void>>();

function broadcast(name: string, data: unknown) {
  setTimeout(() => {
    listeners.get(name)?.forEach((fn) => fn({ data }));
  }, 0);
}

export const Events = {
  On(name: string, handler: (event: unknown) => void) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(handler);
    return () => {
      listeners.get(name)?.delete(handler);
    };
  },

  Off(name: string, handler: (event: unknown) => void) {
    listeners.get(name)?.delete(handler);
  },

  Emit(name: string, data: unknown) {
    if (name === "license:validate") {
      setTimeout(() => {
        broadcast("license:changed", {
          state: "anonymous",
          entitlements: [],
          email: "",
          subscription: null,
        });
      }, 50);
      return;
    }

    if (name === "calendar:get") {
      setTimeout(() => broadcast("calendar:loaded", { calendar: mockCalendar }), 50);
      return;
    }

    if (name === "app:version:get") {
      setTimeout(() => broadcast("app:version", { version: "v0.1.0.3" }), 50);
      return;
    }

    if (name === "telemetry:source-status:get") {
      setTimeout(
        () =>
          broadcast("telemetry:source-status", {
            kind: "lmu",
            name: "LMU",
            live: true,
            available: true,
          }),
        50,
      );
      return;
    }

    if (name === "settings:get") {
      setTimeout(
        () =>
          broadcast("settings", {
            betaWelcomeCompleted: true,
            betaUserRole: "racer",
            activeOverlayProfileId: null,
            deltaMode: "relative",
          }),
        50,
      );
      return;
    }

    broadcast(name, data);
  },
};

export const Browser = {
  OpenURL: (_url: string) => {
    // no-op in harness
  },
};
