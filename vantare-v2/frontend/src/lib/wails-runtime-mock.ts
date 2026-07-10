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

type HarnessWidgetDesign = {
  id: string;
  name: string;
  widgetType: string;
  systemId: string;
  systemVersion: number;
  configVersion: number;
  visual: Record<string, unknown>;
  content?: Record<string, unknown>;
  includesContent: boolean;
  origin: "vantare" | "user";
  createdAt?: string;
  updatedAt?: string;
};

const harnessDesignLibrary: HarnessWidgetDesign[] = [];

function createHarnessDesignId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `harness-design-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readHarnessPayload(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return {};
}

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

    // In-memory widget design library for Overlay Studio V3 harness
    if (name === "design:list") {
      const payload = readHarnessPayload(data);
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      const widgetType = typeof payload.widgetType === "string" ? payload.widgetType : "";
      const designs =
        widgetType === ""
          ? [...harnessDesignLibrary]
          : harnessDesignLibrary.filter((design) => design.widgetType === widgetType);
      setTimeout(() => {
        broadcast("design:list:response", { requestId, designs });
      }, 0);
      return;
    }

    if (name === "design:save") {
      const payload = readHarnessPayload(data);
      const rawDesign = payload.design;
      if (!rawDesign || typeof rawDesign !== "object") {
        setTimeout(() => {
          broadcast("design:error", { operation: "save", message: "missing design payload" });
        }, 0);
        return;
      }
      const incoming = rawDesign as HarnessWidgetDesign;
      const now = new Date().toISOString();
      const id = incoming.id?.trim() ? incoming.id : createHarnessDesignId();
      const existingIndex = harnessDesignLibrary.findIndex((design) => design.id === id);
      const saved: HarnessWidgetDesign = {
        ...incoming,
        id,
        origin: "user",
        createdAt: existingIndex >= 0 ? harnessDesignLibrary[existingIndex]?.createdAt ?? now : now,
        updatedAt: now,
      };
      if (existingIndex >= 0) {
        harnessDesignLibrary[existingIndex] = saved;
      } else {
        harnessDesignLibrary.push(saved);
      }
      setTimeout(() => {
        broadcast("design:saved", { design: saved });
      }, 0);
      return;
    }

    if (name === "design:delete") {
      const payload = readHarnessPayload(data);
      const id = typeof payload.id === "string" ? payload.id : "";
      const index = harnessDesignLibrary.findIndex((design) => design.id === id);
      if (index < 0) {
        setTimeout(() => {
          broadcast("design:error", { operation: "delete", message: `design not found: ${id}` });
        }, 0);
        return;
      }
      harnessDesignLibrary.splice(index, 1);
      setTimeout(() => {
        broadcast("design:deleted", { id });
      }, 0);
      return;
    }

    if (name === "design:rename") {
      const payload = readHarnessPayload(data);
      const id = typeof payload.id === "string" ? payload.id : "";
      const nextName = typeof payload.name === "string" ? payload.name.trim() : "";
      const design = harnessDesignLibrary.find((entry) => entry.id === id);
      if (!design || nextName === "") {
        setTimeout(() => {
          broadcast("design:error", { operation: "rename", message: "invalid rename payload" });
        }, 0);
        return;
      }
      design.name = nextName;
      design.updatedAt = new Date().toISOString();
      setTimeout(() => {
        broadcast("design:renamed", { id, name: nextName });
      }, 0);
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
