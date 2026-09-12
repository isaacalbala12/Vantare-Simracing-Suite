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

import { subscribeLicenseChanged, subscribeLicenseError } from "./license-events";

describe("license events fanout", () => {
  // El fanout es un singleton de modulo: cada test debe desmontar sus
  // listeners antes de que el siguiente limpie el mock de Wails.
  let active: (() => void)[] = [];
  const subChanged = (listener: (d: unknown) => void) => {
    const off = subscribeLicenseChanged(listener);
    active.push(off);
    return off;
  };
  const subError = (listener: (d: unknown) => void) => {
    const off = subscribeLicenseError(listener);
    active.push(off);
    return off;
  };

  beforeEach(() => {
    active.forEach((off) => off());
    active = [];
    mocks.handlers.clear();
    mocks.on.mockClear();
  });

  it("instala una unica suscripcion Wails y reparte event.data desenvuelto", () => {
    const a = vi.fn();
    const b = vi.fn();
    subChanged(a);
    subChanged(b);

    expect(mocks.on).toHaveBeenCalledTimes(1);
    mocks.handlers.get("license:changed")?.({ data: { state: "active" } });
    expect(a).toHaveBeenCalledWith({ state: "active" });
    expect(b).toHaveBeenCalledWith({ state: "active" });
  });

  it("no cierra la suscripcion Wails hasta que se va el ultimo listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subChanged(a);
    const offB = subChanged(b);

    offA();
    mocks.handlers.get("license:changed")?.({ data: { state: "expired" } });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    // La suscripcion Wails sigue viva mientras quede un listener.
    expect(mocks.handlers.has("license:changed")).toBe(true);

    offB();
    expect(mocks.handlers.has("license:changed")).toBe(false);
  });

  it("un unsubscribe repetido no desconecta a otros", () => {
    const a = vi.fn();
    const offA = subChanged(a);
    offA();
    offA();
    mocks.handlers.get("license:changed")?.({ data: null });
    expect(a).not.toHaveBeenCalled();
  });

  it("los canales changed y error son independientes", () => {
    const changed = vi.fn();
    const error = vi.fn();
    subChanged(changed);
    subError(error);

    mocks.handlers.get("license:error")?.({ data: { message: "boom" } });
    expect(error).toHaveBeenCalledWith({ message: "boom" });
    expect(changed).not.toHaveBeenCalled();
  });
});
