/**
 * Mock for @wailsio/runtime used by visual harnesses only (VITE_RUNTIME_MOCK).
 * Auto-responds to common events with realistic data so the app
 * renders without a real Wails backend.
 */
import { mockCalendar } from "../hub/calendar-visual-mock-data";
import { licenseDebugWarn } from "./license-debug";
import { setWailsRuntimeMockActive } from "./license-debug-log";

setWailsRuntimeMockActive(true);
licenseDebugWarn(
  "wails-mock",
  "wails-runtime-mock activo — license/reset NO usan el backend Go real",
);

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
      licenseDebugWarn("wails-mock", "license:validate interceptado (mock)", {
        email: "test@example.com",
        entitlements: ["overlays"],
      });
      setTimeout(() => {
        broadcast("license:changed", {
          state: "active",
          entitlements: ["overlays"],
          userId: "mock-user",
          email: "test@example.com",
          deviceOK: true,
          lastValidated: new Date().toISOString(),
        });
      }, 50);
      return;
    }

    if (name === "license:reset-device") {
      licenseDebugWarn("wails-mock", "license:reset-device interceptado (mock)");
      setTimeout(() => {
        broadcast("license:changed", {
          state: "active",
          entitlements: ["overlays"],
          userId: "mock-user",
          email: "test@example.com",
          deviceOK: true,
          lastValidated: new Date().toISOString(),
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

    // Auto-respond to the canonical launcher snapshot request.
    if (name === "launcher:snapshot:get") {
      setTimeout(
        () =>
          broadcast("launcher:snapshot", {
            revision: 1,
            apps: [
              { id: "lmu", displayName: "Le Mans Ultimate", abbreviation: "LMU", category: "simulator", launchMethod: "steam-uri", steamAppId: 2399420, detected: true, gradientFrom: "#ff3b3b", gradientTo: "#9a0606", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "obs", displayName: "OBS Studio", abbreviation: "OBS", category: "streaming", launchMethod: "executable", detected: true, gradientFrom: "#302e31", gradientTo: "#0a0a0a", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "crewchief", displayName: "CrewChief", abbreviation: "CC", category: "utility", launchMethod: "executable", detected: true, gradientFrom: "#3b82f6", gradientTo: "#1d4ed8", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "discord", displayName: "Discord", abbreviation: "DC", category: "utility", launchMethod: "executable", detected: true, gradientFrom: "#5865F2", gradientTo: "#404EED", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "spotify", displayName: "Spotify", abbreviation: "Sp", category: "audio", launchMethod: "executable", detected: true, gradientFrom: "#10b981", gradientTo: "#059669", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "motec", displayName: "MoTeC", abbreviation: "MT", category: "telemetry", launchMethod: "executable", detected: true, gradientFrom: "#f59e0b", gradientTo: "#b45309", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "simhub", displayName: "SimHub", abbreviation: "SH", category: "telemetry", launchMethod: "executable", detected: false, gradientFrom: "#8b5cf6", gradientTo: "#6d28d9", availability: { catalogued: true, found: false, installed: false, launchable: false } },
            ],
            vantareProfiles: [
              { id: "creator", name: "Creador de Contenido", description: "LMU + OBS + Spotify", steps: [{ appId: "lmu", delay: 0 }, { appId: "obs", delay: 2 }, { appId: "spotify", delay: 2 }] },
              { id: "pro", name: "Pro", steps: [{ appId: "lmu", delay: 0 }, { appId: "crewchief", delay: 2 }, { appId: "spotify", delay: 2 }, { appId: "motec", delay: 2 }] },
            ],
            userProfiles: [],
            activeChains: [],
            discovery: { scanning: false, lastScanAt: new Date().toISOString(), error: null },
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
