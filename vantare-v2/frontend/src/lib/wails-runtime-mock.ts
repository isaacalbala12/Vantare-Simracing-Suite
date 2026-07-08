/**
 * Mock for @wailsio/runtime used by the calendar visual harness.
 * Auto-responds to common events with realistic data so the app
 * renders without a real Wails backend.
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

    // Auto-respond to license validation
    if (name === "license:validate") {
      setTimeout(() => {
        broadcast("license:changed", {
          state: "active",
          entitlements: ["overlays"],
          email: "test@example.com",
          subscription: "lifetime",
        });
      }, 50);
      return;
    }

    // Auto-respond to calendar request
    if (name === "calendar:get") {
      setTimeout(() => {
        broadcast("calendar:loaded", { calendar: mockCalendar });
      }, 50);
      return;
    }

    // Auto-respond to app version
    if (name === "app:version:get") {
      setTimeout(() => broadcast("app:version", { version: "v0.1.0.2" }), 50);
      return;
    }

    // Auto-respond to telemetry source status
    if (name === "telemetry:source-status:get") {
      setTimeout(
        () =>
          broadcast("telemetry:source-status", {
            kind: "none",
            name: "No source",
            live: false,
            available: false,
          }),
        50,
      );
      return;
    }

    // Auto-respond to settings request
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

    // Auto-respond to hub profiles list
    if (name === "hub:list") {
      setTimeout(() => broadcast("hub:profiles", { profiles: [] }), 50);
      return;
    }

    // Auto-respond to launcher apps discovery
    if (name === "launcher:apps:discover") {
      setTimeout(
        () =>
          broadcast("launcher:apps:detected", {
            apps: [
              { id: "lmu", displayName: "Le Mans Ultimate", abbreviation: "LMU", category: "simulator", launchMethod: "steam-uri", steamAppId: 2399420, detected: true, gradientFrom: "#ff3b3b", gradientTo: "#9a0606" },
              { id: "obs", displayName: "OBS Studio", abbreviation: "OBS", category: "streaming", launchMethod: "executable", detected: true, gradientFrom: "#302e31", gradientTo: "#0a0a0a" },
              { id: "crewchief", displayName: "CrewChief", abbreviation: "CC", category: "utility", launchMethod: "executable", detected: true, gradientFrom: "#3b82f6", gradientTo: "#1d4ed8" },
              { id: "discord", displayName: "Discord", abbreviation: "DC", category: "utility", launchMethod: "executable", detected: true, gradientFrom: "#5865F2", gradientTo: "#404EED" },
              { id: "spotify", displayName: "Spotify", abbreviation: "Sp", category: "audio", launchMethod: "executable", detected: true, gradientFrom: "#10b981", gradientTo: "#059669" },
              { id: "motec", displayName: "MoTeC", abbreviation: "MT", category: "telemetry", launchMethod: "executable", detected: true, gradientFrom: "#f59e0b", gradientTo: "#b45309" },
              { id: "simhub", displayName: "SimHub", abbreviation: "SH", category: "telemetry", launchMethod: "executable", detected: true, gradientFrom: "#8b5cf6", gradientTo: "#6d28d9" },
            ],
          }),
        50,
      );
      return;
    }

    // Auto-respond to launcher profiles list
    if (name === "launcher:profiles:list") {
      setTimeout(
        () =>
          broadcast("launcher:profiles:updated", {
            profiles: [
              {
                id: "creator",
                name: "Creador de Contenido",
                description: "LMU + OBS + Spotify",
                steps: [
                  { appId: "lmu", delay: 0 },
                  { appId: "obs", delay: 2 },
                  { appId: "spotify", delay: 2 },
                ],
              },
              {
                id: "pro",
                name: "Pro",
                steps: [
                  { appId: "lmu", delay: 0 },
                  { appId: "crewchief", delay: 2 },
                  { appId: "spotify", delay: 2 },
                  { appId: "motec", delay: 2 },
                ],
              },
            ],
          }),
        50,
      );
      return;
    }

    // Broadcast any other event to listeners
    broadcast(name, data);
  },
};

export const Browser = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  OpenURL: (_url: string) => {
    // no-op in harness
  },
};
