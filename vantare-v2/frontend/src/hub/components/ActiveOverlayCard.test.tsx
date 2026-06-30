import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { ActiveOverlayCard } from "./ActiveOverlayCard";

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
  act(() => {
    for (const handler of listeners.get(name) ?? []) {
      handler({ data });
    }
  });
}

function dispatchSettings(overrides: Record<string, unknown> = {}) {
  dispatch("settings", {
    deltaMode: "self",
    cpuSampling: true,
    hotkeys: {},
    ...overrides,
  });
}

function dispatchProfiles(profiles: Array<Record<string, unknown>>) {
  dispatch("hub:profiles", { profiles });
}

describe("ActiveOverlayCard", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  it("requests settings and profiles on mount", () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);
    expect(Events.Emit).toHaveBeenCalledWith("settings:get");
    expect(Events.Emit).toHaveBeenCalledWith("hub:list");
  });

  it("shows CTA to Overlays Studio when there is no active profile", () => {
    const onNavigate = vi.fn();
    render(<ActiveOverlayCard onNavigate={onNavigate} />);

    dispatchSettings({ activeOverlayProfileId: "" });

    expect(screen.getByTestId("active-overlay-card")).toBeTruthy();
    expect(screen.getByTestId("active-overlay-cta")).toBeTruthy();
    expect(screen.queryByTestId("active-overlay-open")).toBeNull();
    expect(screen.queryByTestId("active-overlay-edit")).toBeNull();
    expect(screen.queryByTestId("active-overlay-name")).toBeNull();

    fireEvent.click(screen.getByTestId("active-overlay-cta"));
    expect(onNavigate).toHaveBeenCalledWith("profiles");
    expect(Events.Emit).not.toHaveBeenCalledWith("overlay:start-active");
    expect(Events.Emit).not.toHaveBeenCalledWith("overlay:toggle-edit-mode");
  });

  it("does not emit overlay events when no active profile id is set", () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);
    dispatchSettings();
    expect(Events.Emit).not.toHaveBeenCalledWith("overlay:start-active");
    expect(Events.Emit).not.toHaveBeenCalledWith("overlay:toggle-edit-mode");
  });

  it("renders the active profile name when settings + profiles provide it", async () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);

    dispatchProfiles([
      {
        id: "p1",
        file: "p1.json",
        name: "Mi setup GT3",
        displayMode: "racing",
        widgets: 5,
      },
    ]);

    dispatchSettings({ activeOverlayProfileId: "p1" });

    const name = await screen.findByTestId("active-overlay-name");
    expect(name.textContent).toBe("Mi setup GT3");
    expect(screen.getByTestId("active-overlay-badge").textContent).toMatch(/Activo/i);
    expect(screen.getByTestId("active-overlay-open")).toBeTruthy();
    expect(screen.getByTestId("active-overlay-edit")).toBeTruthy();
  });

  it("emits overlay:start-active when clicking Abrir overlay", async () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);

    dispatchProfiles([
      { id: "p1", file: "p1.json", name: "Mi setup", displayMode: "racing", widgets: 3 },
    ]);
    dispatchSettings({ activeOverlayProfileId: "p1" });

    fireEvent.click(await screen.findByTestId("active-overlay-open"));

    expect(Events.Emit).toHaveBeenCalledWith("overlay:start-active");
  });

  it("emits overlay:toggle-edit-mode when clicking Editar overlay", async () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);

    dispatchProfiles([
      { id: "p1", file: "p1.json", name: "Mi setup", displayMode: "racing", widgets: 3 },
    ]);
    dispatchSettings({ activeOverlayProfileId: "p1" });

    fireEvent.click(await screen.findByTestId("active-overlay-edit"));

    expect(Events.Emit).toHaveBeenCalledWith("overlay:toggle-edit-mode");
  });

  it("shows stale-active message and CTA when active id is not in profiles list", () => {
    const onNavigate = vi.fn();
    render(<ActiveOverlayCard onNavigate={onNavigate} />);

    dispatchProfiles([
      { id: "other", file: "other.json", name: "Otro", displayMode: "racing", widgets: 2 },
    ]);
    dispatchSettings({ activeOverlayProfileId: "gone" });

    expect(screen.getByTestId("active-overlay-card")).toBeTruthy();
    expect(screen.getByText(/ya no esta disponible/i)).toBeTruthy();
    expect(screen.getByTestId("active-overlay-cta")).toBeTruthy();
    expect(screen.queryByTestId("active-overlay-open")).toBeNull();
    expect(screen.queryByTestId("active-overlay-edit")).toBeNull();

    fireEvent.click(screen.getByTestId("active-overlay-cta"));
    expect(onNavigate).toHaveBeenCalledWith("profiles");
    expect(Events.Emit).not.toHaveBeenCalledWith("overlay:start-active");
    expect(Events.Emit).not.toHaveBeenCalledWith("overlay:toggle-edit-mode");
  });

  it("disables Abrir overlay when overlay is running with the active profile", async () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);

    dispatchProfiles([
      { id: "p1", file: "p1.json", name: "Mi setup", displayMode: "racing", widgets: 3 },
    ]);
    dispatchSettings({ activeOverlayProfileId: "p1" });

    const openBtn = await screen.findByTestId("active-overlay-open");
    expect(openBtn.textContent).toBe("Abrir overlay");
    expect(openBtn.hasAttribute("disabled")).toBe(false);

    dispatch("overlay:status", { running: true, profileId: "p1", mode: "racing" });

    await waitFor(() => {
      const btn = screen.getByTestId("active-overlay-open");
      expect(btn.textContent).toBe("Overlay en ejecucion");
      expect(btn.hasAttribute("disabled")).toBe(true);
    });
  });

  it("switches Editar overlay label when overlay is in edit mode", async () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);

    dispatchProfiles([
      { id: "p1", file: "p1.json", name: "Mi setup", displayMode: "racing", widgets: 3 },
    ]);
    dispatchSettings({ activeOverlayProfileId: "p1" });

    const editBtn = await screen.findByTestId("active-overlay-edit");
    expect(editBtn.textContent).toBe("Editar overlay");

    dispatch("overlay:status", { running: true, profileId: "p1", mode: "edit" });

    await waitFor(() => {
      expect(screen.getByTestId("active-overlay-edit").textContent).toBe(
        "Salir de edicion",
      );
    });
  });

  it("re-enables Abrir overlay when overlay status reports not running", async () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);

    dispatchProfiles([
      { id: "p1", file: "p1.json", name: "Mi setup", displayMode: "racing", widgets: 3 },
    ]);
    dispatchSettings({ activeOverlayProfileId: "p1" });

    dispatch("overlay:status", { running: true, profileId: "p1", mode: "racing" });

    await waitFor(() => {
      expect(screen.getByTestId("active-overlay-open").hasAttribute("disabled")).toBe(
        true,
      );
    });

    dispatch("overlay:status", { running: false });

    await waitFor(() => {
      const btn = screen.getByTestId("active-overlay-open");
      expect(btn.hasAttribute("disabled")).toBe(false);
      expect(btn.textContent).toBe("Abrir overlay");
    });
  });

  it("re-requests hub:list when hub:profiles:reload fires", () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);

    vi.mocked(Events.Emit).mockClear();

    dispatch("hub:profiles:reload", undefined);

    expect(Events.Emit).toHaveBeenCalledWith("hub:list");
  });

  it("renders secondary CTA 'Usar perfil recomendado' when no active profile and prop is provided", () => {
    const onUseRecommended = vi.fn();
    render(
      <ActiveOverlayCard
        onNavigate={vi.fn()}
        onUseRecommended={onUseRecommended}
      />,
    );
    dispatchSettings({ activeOverlayProfileId: "" });

    const cta = screen.getByTestId("active-overlay-cta");
    expect(cta.textContent).toBe("Ir a Overlays Studio");

    const secondary = screen.getByTestId("active-overlay-recommended-cta");
    expect(secondary.textContent).toMatch(/Usar perfil recomendado/i);

    fireEvent.click(secondary);
    expect(onUseRecommended).toHaveBeenCalledTimes(1);
  });

  it("does not render secondary CTA when onUseRecommended prop is not provided", () => {
    render(<ActiveOverlayCard onNavigate={vi.fn()} />);
    dispatchSettings({ activeOverlayProfileId: "" });
    expect(screen.queryByTestId("active-overlay-recommended-cta")).toBeNull();
  });
});