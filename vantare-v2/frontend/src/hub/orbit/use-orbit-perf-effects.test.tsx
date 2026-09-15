import { act, cleanup, render } from "@testing-library/react";
import { Events } from "@wailsio/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrbitPerfEffects } from "./use-orbit-perf-effects";

type Handler = (event: { data?: unknown }) => void;

const handlers = new Map<string, Set<Handler>>();

function emit(name: string, data: unknown) {
  act(() => {
    for (const handler of handlers.get(name) ?? []) handler({ data });
  });
}

const root = () => document.documentElement;

function Probe() {
  useOrbitPerfEffects();
  return null;
}

describe("useOrbitPerfEffects", () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(Events.On).mockImplementation(((name: string, handler: Handler) => {
      const set = handlers.get(name) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(name, set);
      return () => set.delete(handler);
    }) as unknown as typeof Events.On);
    vi.mocked(Events.Emit).mockClear();
    delete root().dataset.orbitPerfEffects;
  });

  afterEach(() => {
    cleanup();
    delete root().dataset.orbitPerfEffects;
  });

  it("publica el presupuesto de efectos en la raíz del documento", () => {
    render(<Probe />);
    expect(root().dataset.orbitPerfEffects).toBeUndefined();

    emit("performance:level", { level: 4, mode: "level", effects: "noBlur" });
    expect(root().dataset.orbitPerfEffects).toBe("noBlur");

    emit("performance:level", { level: 5, mode: "level", effects: "flat" });
    expect(root().dataset.orbitPerfEffects).toBe("flat");

    emit("performance:level", { level: 1, mode: "level", effects: "full" });
    expect(root().dataset.orbitPerfEffects).toBe("full");
  });

  it("pide los ajustes al montar para recibir la política vigente", () => {
    render(<Probe />);
    expect(vi.mocked(Events.Emit)).toHaveBeenCalledWith("settings:get");
  });

  it("ignora publicaciones sin effects válido y conserva el último conocido", () => {
    render(<Probe />);
    emit("performance:level", { level: 4, mode: "level", effects: "noBlur" });
    expect(root().dataset.orbitPerfEffects).toBe("noBlur");

    emit("performance:level", { level: 4, mode: "level" });
    emit("performance:level", { level: 4, mode: "level", effects: "blurred" });
    emit("performance:level", undefined);
    expect(root().dataset.orbitPerfEffects).toBe("noBlur");
  });

  it("retira el atributo al desmontar", () => {
    const view = render(<Probe />);
    emit("performance:level", { level: 5, mode: "auto", effects: "flat" });
    expect(root().dataset.orbitPerfEffects).toBe("flat");

    view.unmount();
    expect(root().dataset.orbitPerfEffects).toBeUndefined();
  });
});
