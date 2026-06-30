import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { LauncherCard } from "./LauncherCard";

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

function dispatchStatus(payload: Record<string, unknown>) {
  dispatch("launcher:status", { lmu: payload });
}

function dispatchSettings(launchers: Record<string, unknown> | undefined) {
  dispatch("settings", {
    deltaMode: "self",
    cpuSampling: true,
    hotkeys: {},
    launchers,
  });
}

describe("LauncherCard", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  it("requests status and settings on mount", () => {
    render(<LauncherCard />);
    expect(Events.Emit).toHaveBeenCalledWith(
      "launcher:status:get",
      expect.objectContaining({ simulatorId: "lmu" }),
    );
    expect(Events.Emit).toHaveBeenCalledWith("settings:get");
  });

  it("renders the unconfigured state when no settings are present", () => {
    render(<LauncherCard />);
    expect(screen.getByTestId("launcher-card")).toBeTruthy();
    expect(screen.getByTestId("launcher-unconfigured")).toBeTruthy();
    expect(screen.getByText(/Launcher LMU por configurar/i)).toBeTruthy();
  });

  it("renders the ready-steam state when the launcher is configured for Steam", () => {
    render(<LauncherCard />);
    dispatchSettings({
      lmu: {
        simulatorId: "lmu",
        launchMethod: "steam-uri",
        steamAppId: 2399420,
      },
    });
    expect(screen.getByTestId("launcher-ready-steam")).toBeTruthy();
    expect(screen.getByText(/Steam/i)).toBeTruthy();
    expect(screen.getByText(/2399420/)).toBeTruthy();
  });

  it("renders the ready-exec state when the launcher is configured with an executable", () => {
    render(<LauncherCard />);
    dispatchSettings({
      lmu: {
        simulatorId: "lmu",
        launchMethod: "executable",
        executablePath: "C:/Games/LMU/LMU.exe",
        steamAppId: 2399420,
      },
    });
    expect(screen.getByTestId("launcher-ready-exec")).toBeTruthy();
    expect(screen.getByText(/ejecutable local/i)).toBeTruthy();
    expect(screen.getByText(/C:\/Games\/LMU\/LMU\.exe/)).toBeTruthy();
  });

  it("emits launcher:launch with simulatorId 'lmu' when the open button is clicked", () => {
    render(<LauncherCard />);
    dispatchSettings({
      lmu: { simulatorId: "lmu", launchMethod: "steam-uri", steamAppId: 2399420 },
    });
    const btn = screen.getByTestId("launcher-open");
    fireEvent.click(btn);
    expect(Events.Emit).toHaveBeenCalledWith(
      "launcher:launch",
      expect.objectContaining({ simulatorId: "lmu" }),
    );
  });

  it("shows a launcher:error message when one is emitted", () => {
    render(<LauncherCard />);
    dispatch("launcher:error", { message: "Steam no responde" });
    expect(screen.getByTestId("launcher-error").textContent).toMatch(
      /Steam no responde/,
    );
  });

  it("clears the error on launcher:launched", () => {
    render(<LauncherCard />);
    dispatch("launcher:error", { message: "Algo fallo" });
    expect(screen.getByTestId("launcher-error")).toBeTruthy();
    dispatch("launcher:launched", { simulatorId: "lmu", method: "steam-uri" });
    expect(screen.queryByTestId("launcher-error")).toBeNull();
  });

  it("renders the stale state for an unknown launch method", () => {
    render(<LauncherCard />);
    dispatchSettings({
      lmu: { simulatorId: "lmu", launchMethod: "magic" },
    });
    expect(screen.getByTestId("launcher-stale")).toBeTruthy();
  });

  it("opens the config form and emits launcher:configure on save", () => {
    render(<LauncherCard />);
    fireEvent.click(screen.getByTestId("launcher-configure-toggle"));
    expect(screen.getByTestId("launcher-config-form")).toBeTruthy();
    fireEvent.click(screen.getByTestId("launcher-method-steam"));
    fireEvent.click(screen.getByTestId("launcher-save"));
    expect(Events.Emit).toHaveBeenCalledWith(
      "launcher:configure",
      expect.objectContaining({
        simulatorId: "lmu",
        launchMethod: "steam-uri",
      }),
    );
  });

  it("rejects an empty executable path before emitting configure", () => {
    render(<LauncherCard />);
    dispatchSettings({
      lmu: { simulatorId: "lmu", launchMethod: "steam-uri", steamAppId: 2399420 },
    });
    fireEvent.click(screen.getByTestId("launcher-configure-toggle"));
    fireEvent.click(screen.getByTestId("launcher-method-exec"));
    fireEvent.click(screen.getByTestId("launcher-save"));
    expect(screen.getByTestId("launcher-error").textContent).toMatch(
      /ruta del ejecutable/i,
    );
    const emitCalls = (Events.Emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([name]) => name === "launcher:configure",
    );
    expect(emitCalls).toHaveLength(0);
  });

  it("emits launcher:configure with executable path when set", () => {
    render(<LauncherCard />);
    dispatchSettings({
      lmu: { simulatorId: "lmu", launchMethod: "steam-uri", steamAppId: 2399420 },
    });
    fireEvent.click(screen.getByTestId("launcher-configure-toggle"));
    fireEvent.click(screen.getByTestId("launcher-method-exec"));
    const input = screen.getByTestId("launcher-exec-path") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "C:/Games/LMU/LMU.exe" } });
    fireEvent.click(screen.getByTestId("launcher-save"));
    expect(Events.Emit).toHaveBeenCalledWith(
      "launcher:configure",
      expect.objectContaining({
        simulatorId: "lmu",
        launchMethod: "executable",
        executablePath: "C:/Games/LMU/LMU.exe",
      }),
    );
  });

  it("updates the view when launcher:status reports configured", () => {
    render(<LauncherCard />);
    dispatchStatus({ configured: true, launchMethod: "steam-uri", steamAppId: 2399420 });
    expect(screen.getByTestId("launcher-ready-steam")).toBeTruthy();
  });

  it("falls back to unconfigured when launcher:status reports not configured", () => {
    render(<LauncherCard />);
    dispatchSettings({
      lmu: { simulatorId: "lmu", launchMethod: "steam-uri", steamAppId: 2399420 },
    });
    dispatchStatus({ configured: false });
    expect(screen.getByTestId("launcher-unconfigured")).toBeTruthy();
  });
});
