import { fireEvent, render, screen, cleanup, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Events } from "@wailsio/runtime";
import { OverlaysStudioPage } from "./OverlaysStudioPage";

const listeners = new Map<string, ((event: { data: unknown }) => void)[]>();

afterEach(() => {
  cleanup();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, cb: (event: { data: unknown }) => void) => {
      const existing = listeners.get(name) ?? [];
      existing.push(cb);
      listeners.set(name, existing);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

function dispatch(name: string, data: unknown) {
  for (const handler of listeners.get(name) ?? []) {
    handler({ data });
  }
}

const loadedProfile = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
  ],
};

describe("OverlaysStudioPage", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  it("requests profiles on mount", () => {
    render(<OverlaysStudioPage />);
    expect(Events.Emit).toHaveBeenCalledWith("hub:list");
  });

  it("renders the Overlays Studio panel menu after profiles load", async () => {
    render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 3 },
      ],
    });

    expect(await screen.findByRole("heading", { name: "Overlays Studio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Widgets/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Mis perfiles/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Recomendados por Vantare/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Comunidad/i })).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
  });

  it("opens Widget Studio after profiles and active profile load", async () => {
    render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 2 },
      ],
    });

    dispatch("settings", { deltaMode: "self", cpuSampling: true, hotkeys: {}, activeOverlayProfileId: "default-racing" });

    dispatch("profile:loaded", {
      profile: {
        id: "default-racing",
        name: "Default Racing",
        displayMode: "racing",
        monitorIndex: 0,
        widgets: [
          { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
          { id: "relative", type: "relative", enabled: false, updateHz: 15, position: { x: 40, y: 600, w: 320, h: 280 } },
        ],
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Widgets/i }));

    expect(await screen.findAllByRole("heading", { name: "Widgets" })).toBeTruthy();
    expect(screen.getByText("Sin cambios")).toBeTruthy();
  });

  it("shows loading while switching from profile A to profile B in layout studio", async () => {
    render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 1 },
        { id: "profile-b", file: "profile-b.json", name: "Profile B", displayMode: "racing", widgets: 2 },
      ],
    });

    dispatch("settings", { deltaMode: "self", cpuSampling: true, hotkeys: {}, activeOverlayProfileId: "default-racing" });

    dispatch("profile:loaded", {
      profile: {
        id: "default-racing",
        name: "Default Racing",
        displayMode: "racing",
        monitorIndex: 0,
        widgets: [
          { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
        ],
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    expect(await screen.findByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByText("Profile B")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Editar Profile B/i }));

    expect(Events.Emit).toHaveBeenCalledWith("hub:activate", { file: "profile-b.json" });
    expect(screen.queryByText("Perfiles Específicos")).toBeNull();
    expect(screen.getByText("Cargando perfil...")).toBeTruthy();

    dispatch("profile:loaded", {
      profile: {
        id: "profile-b",
        name: "Profile B",
        displayMode: "racing",
        monitorIndex: 0,
        widgets: [
          { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 100, y: 100, w: 200, h: 50 } },
          { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 40, y: 600, w: 320, h: 280 } },
        ],
      },
    });

    expect(await screen.findByText("Perfiles Específicos")).toBeTruthy();
    expect(screen.getByText("POSICIÓN Y TAMAÑO")).toBeTruthy();
    expect(screen.queryByText("Cargando perfil...")).toBeNull();
    expect(screen.getByText(/Este perfil no es el activo/)).toBeTruthy();
  });

  it("opens own profiles, recommended profiles, and community subpages", async () => {
    render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 2 },
      ],
    });

    dispatch("settings", { deltaMode: "self", cpuSampling: true, hotkeys: {}, activeOverlayProfileId: "default-racing" });

    dispatch("profile:loaded", {
      profile: {
        id: "default-racing",
        name: "Default Racing",
        displayMode: "racing",
        monitorIndex: 0,
        widgets: [
          { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
        ],
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    expect(await screen.findByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByText("Default Racing")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Recomendados por Vantare/i }));
    expect(await screen.findByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByText("Clean Overlay")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Comunidad/i }));
    expect(await screen.findByRole("heading", { name: "Comunidad" })).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
  });

  it("saves a recommended profile as an own copy with source metadata", async () => {
    const originalPrompt = window.prompt;
    window.prompt = vi.fn().mockReturnValue("Mi copia") as unknown as typeof window.prompt;

    render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 2 },
      ],
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Recomendados por Vantare/i }));
    expect(await screen.findByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Guardar Clean Overlay como perfil propio/i }));

    expect(Events.Emit).toHaveBeenCalledWith("hub:save-own-copy", expect.anything());
    const emittedPayload = (Events.Emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === "hub:save-own-copy",
    )?.[1] as { profile: { id: string; name: string; source?: { kind: string; profileId: string } } } | undefined;

    expect(emittedPayload?.profile.name).toBe("Mi copia");
    expect(emittedPayload?.profile.id).toMatch(/^custom-/);
    expect(emittedPayload?.profile.source).toEqual({
      kind: "recommended",
      profileId: "vantare-clean-overlay",
      name: "Clean Overlay",
    });

    window.prompt = originalPrompt;
  });

  it("sets active profile and emits hub:set-active from own profiles", async () => {
    render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        {
          id: "default-racing",
          file: "example-racing.json",
          name: "Default Racing",
          displayMode: "racing",
          widgets: 1,
          profile: loadedProfile,
        },
      ],
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Activar Default Racing/i }));

    expect(Events.Emit).toHaveBeenCalledWith("hub:set-active", {
      id: "default-racing",
      file: "example-racing.json",
    });
  });

  it("opens active overlay from own profiles header button", async () => {
    render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        {
          id: "default-racing",
          file: "example-racing.json",
          name: "Default Racing",
          displayMode: "racing",
          widgets: 1,
          profile: loadedProfile,
        },
      ],
    });

    dispatch("settings", { deltaMode: "self", cpuSampling: true, hotkeys: {}, activeOverlayProfileId: "default-racing" });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Abrir overlay" }));

    expect(Events.Emit).toHaveBeenCalledWith("overlay:start-active");
  });

  it("starts and stops overlay from layout studio for the active profile", async () => {
    const { container } = render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        {
          id: "default-racing",
          file: "example-racing.json",
          name: "Default Racing",
          displayMode: "racing",
          widgets: 1,
          profile: loadedProfile,
        },
      ],
    });

    dispatch("settings", { deltaMode: "self", cpuSampling: true, hotkeys: {}, activeOverlayProfileId: "default-racing" });

    dispatch("profile:loaded", { profile: loadedProfile });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(screen.getByRole("button", { name: /Editar Default Racing/i }));

    await screen.findByText("Perfiles Específicos");

    const startBtn = container.querySelector(".flex.items-center.gap-3 button.btn-primary") as HTMLButtonElement;
    fireEvent.click(startBtn);

    expect(Events.Emit).toHaveBeenCalledWith("overlay:start", {
      id: "default-racing",
      file: "example-racing.json",
    });

    dispatch("overlay:status", { running: true, profileId: "default-racing", mode: "racing" });

    const stopBtn = await screen.findByRole("button", { name: "Detener overlay" });
    fireEvent.click(stopBtn);

    expect(Events.Emit).toHaveBeenCalledWith("overlay:stop");
  });

  it("no autosavea en modo layout tras modificar/añadir widget, y requiere guardado explícito", async () => {
    render(<OverlaysStudioPage />);

    dispatch("hub:profiles", {
      profiles: [
        {
          id: "default-racing",
          file: "example-racing.json",
          name: "Default Racing",
          displayMode: "racing",
          widgets: 1,
          profile: loadedProfile,
        },
      ],
    });

    dispatch("settings", { deltaMode: "self", cpuSampling: true, hotkeys: {}, activeOverlayProfileId: "default-racing" });

    dispatch("profile:loaded", { profile: loadedProfile });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(screen.getByRole("button", { name: /Editar Default Racing/i }));

    expect(await screen.findByText("Perfiles Específicos")).toBeTruthy();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    fireEvent.click(screen.getByTestId("studio-show-add-widget"));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "pedals" } });

    vi.clearAllMocks();

    fireEvent.click(screen.getByTestId("studio-confirm-add-widget"));

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    const saveCalls = (Events.Emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0] === "layout:save"
    );
    expect(saveCalls.length).toBe(0);

    const saveBtn = screen.getByRole("button", { name: "Guardar" });
    fireEvent.click(saveBtn);

    expect(Events.Emit).toHaveBeenCalledWith("layout:save", expect.objectContaining({
      widgets: expect.arrayContaining([
        expect.objectContaining({ type: "delta" }),
        expect.objectContaining({ type: "pedals" })
      ])
    }));

    vi.useRealTimers();
  });
});
