import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Events } from "@wailsio/runtime";
import { OverlaysStudioPage } from "./OverlaysStudioPage";

const listeners = new Map<string, (event: { data: unknown }) => void>();

afterEach(() => {
  cleanup();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, cb: (event: { data: unknown }) => void) => {
      listeners.set(name, cb);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

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

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 3 },
        ],
      },
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

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 2 },
        ],
      },
    });

    listeners.get("profile:loaded")?.({
      data: {
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
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Widgets/i }));

    expect(await screen.findAllByRole("heading", { name: "Widgets" })).toBeTruthy();
    expect(screen.getByText("Estos cambios se guardan en el perfil activo.")).toBeTruthy();
  });

  it("shows loading while switching from profile A to profile B in layout studio", async () => {
    render(<OverlaysStudioPage />);

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 1 },
          { id: "profile-b", file: "profile-b.json", name: "Profile B", displayMode: "racing", widgets: 2 },
        ],
      },
    });

    listeners.get("profile:loaded")?.({
      data: {
        profile: {
          id: "default-racing",
          name: "Default Racing",
          displayMode: "racing",
          monitorIndex: 0,
          widgets: [
            { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
          ],
        },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    expect(await screen.findByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByText("Profile B")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Editar Profile B/i }));

    expect(Events.Emit).toHaveBeenCalledWith("hub:activate", { file: "profile-b.json" });
    expect(screen.queryByText("Perfiles Específicos")).toBeNull();
    expect(screen.getByText("Cargando perfil...")).toBeTruthy();

    listeners.get("profile:loaded")?.({
      data: {
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
      },
    });

    expect(await screen.findByText("Perfiles Específicos")).toBeTruthy();
    expect(screen.getByText("POSICIÓN Y TAMAÑO")).toBeTruthy();
    expect(screen.queryByText("Cargando perfil...")).toBeNull();
  });

  it("opens own profiles, recommended profiles, and community subpages", async () => {
    render(<OverlaysStudioPage />);

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 2 },
        ],
      },
    });

    listeners.get("profile:loaded")?.({
      data: {
        profile: {
          id: "default-racing",
          name: "Default Racing",
          displayMode: "racing",
          monitorIndex: 0,
          widgets: [
            { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
          ],
        },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    expect(await screen.findByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByText("Default Racing")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Recomendados por Vantare/i }));
    expect(await screen.findByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByText("Racing Básico")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Comunidad/i }));
    expect(await screen.findByRole("heading", { name: "Comunidad" })).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
  });
});
