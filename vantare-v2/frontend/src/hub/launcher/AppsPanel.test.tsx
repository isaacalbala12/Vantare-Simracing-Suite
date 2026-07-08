import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { AppsPanel } from "./AppsPanel";

const listeners = new Map<string, ((event: { data: unknown }) => void)[]>();
const emitCalls: { name: string; data: unknown }[] = [];

afterEach(() => {
  cleanup();
  listeners.clear();
  emitCalls.length = 0;
  vi.clearAllMocks();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, cb: (event: { data: unknown }) => void) => {
      const existing = listeners.get(name) ?? [];
      existing.push(cb);
      listeners.set(name, existing);
      return vi.fn();
    }),
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

  it("opens the manual-add form after the user selects a file", () => {
    render(<AppsPanel />);
    const file = new File(["MZ"], "app.exe");
    const input = screen.getByTestId("apps-file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByTestId("app-add-form")).toBeTruthy();
  });

  it("emits launcher:app:add with the picked path when the form is saved", () => {
    render(<AppsPanel />);
    const file = new File(["MZ"], "myapp.exe");
    const input = screen.getByTestId("apps-file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    // Browser provides the path via webkitRelativePath/file path; we set the
    // name via a programmatic value since jsdom does not resolve a real path.
    Object.defineProperty(input, "files", {
      value: [{ name: "myapp.exe" }],
      configurable: true,
    });
    fireEvent.change(input, { target: { files: [{ name: "myapp.exe", path: "C:/apps/myapp.exe" }] } });
    fireEvent.change(screen.getByTestId("app-add-name"), {
      target: { value: "My App" },
    });
    fireEvent.click(screen.getByTestId("app-add-save"));
    const addCall = emitCalls.find((c) => c.name === "launcher:app:add");
    expect(addCall).toBeDefined();
    const data = addCall!.data as { entry: { executablePath: string; displayName: string } };
    expect(data.entry.executablePath).toBe("C:/apps/myapp.exe");
    expect(data.entry.displayName).toBe("My App");
  });
});
