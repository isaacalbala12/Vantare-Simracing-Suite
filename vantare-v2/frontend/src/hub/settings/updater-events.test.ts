import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  return {
    handlers,
    on: vi.fn((name: string, handler: (event: unknown) => void) => {
      handlers.set(name, handler);
      return vi.fn(() => handlers.delete(name));
    }),
  };
});

vi.mock("@wailsio/runtime", () => ({
  Events: { On: mocks.on, Emit: vi.fn() },
}));

import {
  subscribeUpdaterAvailable,
  subscribeUpdaterChannel,
  subscribeUpdaterError,
  subscribeUpdaterSettings,
} from "./updater-events";
import { UPDATER_CHANNEL_EVENT } from "./updater-channel";

describe("updater events fanout", () => {
  // El fanout es un singleton de modulo: cada test debe desmontar sus
  // listeners antes de que el siguiente limpie el mock de Wails.
  let active: (() => void)[] = [];
  const sub = (
    subscribe: (listener: (d: unknown) => void) => () => void,
    listener: (d: unknown) => void,
  ) => {
    const off = subscribe(listener);
    active.push(off);
    return off;
  };

  beforeEach(() => {
    active.forEach((off) => off());
    active = [];
    mocks.handlers.clear();
    mocks.on.mockClear();
  });

  it("instala una unica suscripcion Wails por canal y reparte event.data desenvuelto", () => {
    const a = vi.fn();
    const b = vi.fn();
    sub(subscribeUpdaterSettings, a);
    sub(subscribeUpdaterSettings, b);

    expect(mocks.on).toHaveBeenCalledTimes(1);
    expect(mocks.on).toHaveBeenCalledWith("updater:settings", expect.any(Function));
    mocks.handlers.get("updater:settings")?.({ data: { settings: { channel: "nightly" } } });
    expect(a).toHaveBeenCalledWith({ settings: { channel: "nightly" } });
    expect(b).toHaveBeenCalledWith({ settings: { channel: "nightly" } });
  });

  it("no cierra la suscripcion Wails hasta que se va el ultimo listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = sub(subscribeUpdaterAvailable, a);
    const offB = sub(subscribeUpdaterAvailable, b);

    offA();
    mocks.handlers.get("updater:available")?.({ data: { info: { currentVersion: "v1" } } });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    // La suscripcion Wails sigue viva mientras quede un listener.
    expect(mocks.handlers.has("updater:available")).toBe(true);

    offB();
    expect(mocks.handlers.has("updater:available")).toBe(false);
  });

  it("un unsubscribe repetido no desconecta a otros", () => {
    const a = vi.fn();
    const offA = sub(subscribeUpdaterError, a);
    offA();
    offA();
    mocks.handlers.get("updater:error")?.({ data: null });
    expect(a).not.toHaveBeenCalled();
  });

  it("los canales del dominio son independientes entre si", () => {
    const settings = vi.fn();
    const error = vi.fn();
    sub(subscribeUpdaterSettings, settings);
    sub(subscribeUpdaterError, error);

    mocks.handlers.get("updater:error")?.({ data: { message: "boom" } });
    expect(error).toHaveBeenCalledWith({ message: "boom" });
    expect(settings).not.toHaveBeenCalled();
  });

  it("reinstala la suscripcion Wails cuando vuelve a haber listeners", () => {
    const a = vi.fn();
    sub(subscribeUpdaterSettings, a)();
    expect(mocks.handlers.has("updater:settings")).toBe(false);

    const b = vi.fn();
    sub(subscribeUpdaterSettings, b);
    mocks.handlers.get("updater:settings")?.({ data: { settings: { channel: "stable" } } });
    expect(b).toHaveBeenCalledWith({ settings: { channel: "stable" } });
  });

  it("el aviso de canal (hub:updater-channel) pasa por el mismo fanout", () => {
    const listener = vi.fn();
    sub(subscribeUpdaterChannel, listener);
    mocks.handlers.get(UPDATER_CHANNEL_EVENT)?.({ data: { channel: "testers" } });
    expect(listener).toHaveBeenCalledWith({ channel: "testers" });
  });
});
