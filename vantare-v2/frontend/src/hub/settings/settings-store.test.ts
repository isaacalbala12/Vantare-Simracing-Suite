import { describe, expect, it, vi } from "vitest";
import { createSettingsStore, type SettingsEventsLike } from "./settings-store";
import type { AppSettings } from "./settings-contract";

function makeEvents() {
  const settingsListeners = new Set<(s: AppSettings) => void>();
  const savedListeners = new Set<(p: unknown) => void>();
  const events: SettingsEventsLike = {
    subscribeSettings: vi.fn((listener) => {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    }),
    subscribeSettingsSaved: vi.fn((listener) => {
      savedListeners.add(listener);
      return () => savedListeners.delete(listener);
    }),
    requestSettings: vi.fn(),
    saveSettings: vi.fn(),
  };
  return {
    events,
    emitSettings: (settings: AppSettings) =>
      settingsListeners.forEach((listener) => listener(settings)),
    emitSaved: (payload: unknown) =>
      savedListeners.forEach((listener) => listener(payload)),
    settingsSubCount: () => settingsListeners.size,
  };
}

describe("settings store fanout", () => {
  it("dos suscriptores comparten una unica suscripcion al puente", () => {
    const { events } = makeEvents();
    const store = createSettingsStore(events);
    const a = vi.fn();
    const b = vi.fn();

    const offA = store.subscribe(a);
    const offB = store.subscribe(b);
    expect(events.subscribeSettings).toHaveBeenCalledTimes(1);

    offA();
    // Mientras quede uno, la suscripcion al puente sigue viva.
    expect(events.subscribeSettings).toHaveBeenCalledTimes(1);
    offB();
  });

  it("el canal de notificaciones solo publica cuando el valor cambia", () => {
    const { events, emitSettings } = makeEvents();
    const store = createSettingsStore(events);
    const listener = vi.fn();
    store.subscribeNotificationPreferences(listener);

    emitSettings({ notifications: { updatesMuted: true } } as AppSettings);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getNotificationPreferences().updatesMuted).toBe(true);

    // Mismo valor: objeto nuevo entrante, pero el slice no despierta a nadie.
    emitSettings({ notifications: { updatesMuted: true } } as AppSettings);
    expect(listener).toHaveBeenCalledTimes(1);

    emitSettings({ notifications: { updatesMuted: false } } as AppSettings);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("activeOverlayProfileId normaliza cadena vacia a null", () => {
    const { events, emitSettings } = makeEvents();
    const store = createSettingsStore(events);
    const listener = vi.fn();
    store.subscribeActiveOverlayProfileId(listener);

    emitSettings({ activeOverlayProfileId: "p1" } as AppSettings);
    expect(store.getActiveOverlayProfileId()).toBe("p1");

    emitSettings({ activeOverlayProfileId: "" } as AppSettings);
    expect(store.getActiveOverlayProfileId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
