import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { StorageSettings } from "./StorageSettings";
import { formatBytes, useStorageSettings } from "./useStorageSettings";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () => runtimeMock.handlers.delete(name);
    },
    Emit: runtimeMock.emit,
  },
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

function Harness() {
  return (
    <I18nProvider>
      <StorageSettings storage={useStorageSettings()} />
    </I18nProvider>
  );
}

const summary = {
  totalBytes: 1024 * 1024 * 3,
  locations: [
    {
      key: "configs",
      path: "C:\\Users\\isa\\AppData\\Roaming\\Vantare\\configs",
      bytes: 1024 * 512,
      files: 7,
      exists: true,
      clearable: false,
    },
    {
      key: "telemetry",
      path: "C:\\Users\\isa\\AppData\\Local\\Vantare\\telemetry\\sessions",
      bytes: 1024 * 1024 * 2.5,
      files: 12,
      exists: true,
      clearable: true,
    },
  ],
};

describe("StorageSettings", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(cleanup);

  it("asks the backend to measure on mount", () => {
    render(<Harness />);
    expect(runtimeMock.emit).toHaveBeenCalledWith("storage:get");
  });

  // Profiles and settings are not a cache. The backend refuses to empty them,
  // and the UI must not offer a button that would only ever be refused.
  it("offers no way to empty the location the backend marks as not clearable", () => {
    render(<Harness />);
    dispatch("storage", summary);

    expect(screen.getAllByRole("button", { name: "Abrir carpeta" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Vaciar" })).toHaveLength(1);
  });

  it("shows the full path, because a path you cannot read is a path you cannot go to", () => {
    render(<Harness />);
    dispatch("storage", summary);

    expect(
      screen.getByText("C:\\Users\\isa\\AppData\\Local\\Vantare\\telemetry\\sessions"),
    ).toBeDefined();
  });

  it("sends a location key, never a path", () => {
    render(<Harness />);
    dispatch("storage", summary);

    fireEvent.click(screen.getAllByRole("button", { name: "Abrir carpeta" })[1]);
    expect(runtimeMock.emit).toHaveBeenCalledWith("storage:reveal", { key: "telemetry" });
  });

  // Emptying is not undoable, so it goes through a confirmation and nothing is
  // sent until the user says yes.
  it("does not clear until the confirmation is accepted", () => {
    render(<Harness />);
    dispatch("storage", summary);

    fireEvent.click(screen.getByRole("button", { name: "Vaciar" }));
    expect(runtimeMock.emit).not.toHaveBeenCalledWith("storage:clear", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(runtimeMock.emit).not.toHaveBeenCalledWith("storage:clear", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Vaciar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, vaciar" }));
    expect(runtimeMock.emit).toHaveBeenCalledWith("storage:clear", { key: "telemetry" });
  });

  it("disables emptying when there is nothing to empty", () => {
    render(<Harness />);
    dispatch("storage", {
      totalBytes: 0,
      locations: [{ ...summary.locations[1], bytes: 0, files: 0, exists: true }],
    });

    expect((screen.getByRole("button", { name: "Vaciar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("surfaces a refusal from the backend", () => {
    render(<Harness />);
    dispatch("storage", summary);
    dispatch("storage:error", { message: "storage: location cannot be cleared" });

    expect(screen.getByRole("alert").textContent).toContain("cannot be cleared");
  });
});

describe("formatBytes", () => {
  it("reads in the units people read disks in", () => {
    expect(formatBytes(0)).toBe("0 KB");
    // Below a kilobyte the exact number is noise.
    expect(formatBytes(400)).toBe("0 KB");
    expect(formatBytes(1024 * 700)).toBe("700 KB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
    expect(formatBytes(1024 * 1024 * 40)).toBe("40 MB");
    expect(formatBytes(1024 * 1024 * 1024 * 3)).toBe("3.0 GB");
  });

  it("does not produce nonsense for a missing measurement", () => {
    expect(formatBytes(Number.NaN)).toBe("0 KB");
    expect(formatBytes(-1)).toBe("0 KB");
  });
});
