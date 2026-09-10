import { act, cleanup, render, screen } from "@testing-library/react";
import { Events } from "@wailsio/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOverlayState } from "./use-overlay-state";

type Handler = (event: { data?: unknown }) => void;

const handlers = new Map<string, Set<Handler>>();

function emit(name: string, data: unknown) {
  act(() => {
    for (const handler of handlers.get(name) ?? []) handler({ data });
  });
}

function Probe() {
  const overlay = useOverlayState();
  return <span data-testid="active">{overlay.active?.name ?? "—"}</span>;
}

const PROFILES = [
  { id: "a", file: "a.json", name: "Perfil A", widgets: 3 },
  { id: "b", file: "b.json", name: "Perfil B", widgets: 5 },
];

describe("useOverlayState · perfil activo", () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(Events.On).mockImplementation(((name: string, handler: Handler) => {
      const set = handlers.get(name) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(name, set);
      return () => set.delete(handler);
    }) as unknown as typeof Events.On);
    vi.mocked(Events.Emit).mockClear();
  });

  afterEach(() => cleanup());

  it("refleja el perfil activo que confirma `hub:profile-activated`", () => {
    render(<Probe />);
    emit("hub:profiles", { profiles: PROFILES });
    emit("settings", { activeOverlayProfileId: "a" });
    expect(screen.getByTestId("active").textContent).toBe("Perfil A");

    // El backend no reemite `settings`: la confirmación es este evento.
    emit("hub:profile-activated", { activeProfileId: "b" });
    expect(screen.getByTestId("active").textContent).toBe("Perfil B");
  });

  it("vuelve a pedir la lista y los ajustes tras la confirmación", () => {
    render(<Probe />);
    vi.mocked(Events.Emit).mockClear();
    emit("hub:profile-activated", { ok: true });
    const names = vi.mocked(Events.Emit).mock.calls.map((call) => call[0]);
    expect(names).toContain("hub:list");
    expect(names).toContain("settings:get");
  });
});

describe("useOverlayState · store de módulo compartido", () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(Events.On).mockImplementation(((name: string, handler: Handler) => {
      const set = handlers.get(name) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(name, set);
      return () => set.delete(handler);
    }) as unknown as typeof Events.On);
    vi.mocked(Events.On).mockClear();
    vi.mocked(Events.Emit).mockClear();
  });

  afterEach(() => cleanup());

  it("dos consumidores simultáneos abren una sola suscripción y un solo handshake", () => {
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    const subscribed = vi.mocked(Events.On).mock.calls.map((call) => call[0]).sort();
    expect(subscribed).toEqual([
      "hub:profile-activated",
      "hub:profiles",
      "overlay:status",
      "settings",
      "settings-saved",
    ]);
    const emitted = vi.mocked(Events.Emit).mock.calls.map((call) => call[0]);
    expect(emitted.filter((name) => name === "hub:list")).toHaveLength(1);
    expect(emitted.filter((name) => name === "settings:get")).toHaveLength(1);
    expect(emitted.filter((name) => name === "overlay:status:get")).toHaveLength(1);

    // Fan-out: un solo evento del backend actualiza a los dos consumidores.
    emit("hub:profiles", { profiles: PROFILES });
    emit("settings", { activeOverlayProfileId: "a" });
    for (const node of screen.getAllByTestId("active")) {
      expect(node.textContent).toBe("Perfil A");
    }
  });

  it("un segundo montaje con el store activo no repite el handshake", () => {
    render(<Probe />);
    vi.mocked(Events.Emit).mockClear();
    render(<Probe />);
    expect(vi.mocked(Events.Emit)).not.toHaveBeenCalled();
  });

  it("la suscripción sobrevive al primer desmontaje y se libera con el último", () => {
    const first = render(<Probe />);
    const second = render(<Probe />);
    expect(handlers.get("hub:profiles")?.size).toBe(1);
    first.unmount();
    expect(handlers.get("hub:profiles")?.size).toBe(1);
    second.unmount();
    expect(handlers.get("hub:profiles")?.size ?? 0).toBe(0);
    expect(handlers.get("settings")?.size ?? 0).toBe(0);
    expect(handlers.get("settings-saved")?.size ?? 0).toBe(0);
    expect(handlers.get("overlay:status")?.size ?? 0).toBe(0);
    expect(handlers.get("hub:profile-activated")?.size ?? 0).toBe(0);
  });
});
