import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { AppsPanel } from "./AppsPanel";

const listeners = new Map<
  string,
  ((event: { data: unknown }) => void)[]
>();
const emitCalls: { name: string; data: unknown }[] = [];

afterEach(() => {
  cleanup();
  listeners.clear();
  emitCalls.length = 0;
  vi.clearAllMocks();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(
      (name: string, cb: (event: { data: unknown }) => void) => {
        const existing = listeners.get(name) ?? [];
        existing.push(cb);
        listeners.set(name, existing);
        return vi.fn();
      },
    ),
    Emit: vi.fn((name: string, data: unknown) => {
      emitCalls.push({ name, data });
    }),
  },
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of listeners.get(name) ?? []) {
      handler({ data });
    }
  });
}

describe("AppsPanel", () => {
  it("requests discovery and profile list on mount", () => {
    render(<AppsPanel />);
    expect(Events.Emit).toHaveBeenCalledWith("launcher:apps:discover");
  });

  it("renders detected apps received via event", () => {
    render(<AppsPanel />);
    dispatch("launcher:apps:detected", {
      apps: [
        {
          id: "lmu",
          displayName: "Le Mans Ultimate",
          abbreviation: "LMU",
          category: "simulator",
          launchMethod: "steam-uri",
          steamAppId: 2399420,
          detected: true,
          gradientFrom: "#ff3b3b",
          gradientTo: "#9a0606",
        },
      ],
    });
    expect(screen.getByTestId("app-row-lmu")).toBeTruthy();
  });

  it("opens AddNonSteamGameModal on add button click", () => {
    render(<AppsPanel />);
    fireEvent.click(screen.getByTestId("apps-add-manual"));
    expect(screen.getByTestId("add-non-steam-modal")).toBeTruthy();
  });

  it("renders details panel with args input when clicking on an app", () => {
    render(<AppsPanel />);
    dispatch("launcher:apps:detected", {
      apps: [
        {
          id: "obs",
          displayName: "OBS Studio",
          abbreviation: "OBS",
          category: "streaming",
          launchMethod: "executable",
          executablePath: "C:\\obs\\obs64.exe",
          detected: true,
          gradientFrom: "#302e31",
          gradientTo: "#1a1a1a",
        },
      ],
    });
    fireEvent.click(screen.getByTestId("app-row-obs"));
    expect(screen.getByTestId("app-details-obs")).toBeTruthy();
    expect(screen.getByTestId("app-args-input-obs")).toBeTruthy();
  });

  it("emits launcher:app:update when editing args", () => {
    render(<AppsPanel />);
    dispatch("launcher:apps:detected", {
      apps: [
        {
          id: "obs",
          displayName: "OBS Studio",
          abbreviation: "OBS",
          category: "streaming",
          launchMethod: "executable",
          executablePath: "C:\\obs\\obs64.exe",
          args: "",
          detected: true,
          gradientFrom: "#302e31",
          gradientTo: "#1a1a1a",
        },
      ],
    });
    fireEvent.click(screen.getByTestId("app-row-obs"));
    fireEvent.change(screen.getByTestId("app-args-input-obs"), {
      target: { value: "--start-streaming" },
    });
    const updateCall = emitCalls.find(
      (c) => c.name === "launcher:app:update",
    );
    expect(updateCall).toBeDefined();
    const data = updateCall!.data as { id: string; args: string };
    expect(data.id).toBe("obs");
    expect(data.args).toBe("--start-streaming");
  });
});
