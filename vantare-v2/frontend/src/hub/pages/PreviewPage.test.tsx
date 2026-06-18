import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPage } from "./PreviewPage";
import type { ProfileConfig } from "../../lib/profile";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () =>
        runtimeMock.handlers.set(
          name,
          (runtimeMock.handlers.get(name) ?? []).filter((h) => h !== handler),
        );
    },
    Emit: runtimeMock.emit,
  },
}));

const profile: ProfileConfig = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    {
      id: "delta",
      type: "delta",
      enabled: true,
      updateHz: 30,
      position: { x: 10, y: 20, w: 300, h: 80 },
    },
  ],
};

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

describe("PreviewPage", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("only reports saved after backend confirms layout:saved", () => {
    render(<PreviewPage />);
    dispatch("profile:loaded", { profile });

    fireEvent.change(screen.getByLabelText("X (px)"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Guardando...")).toBeTruthy();
    expect(screen.queryByText("Guardado")).toBeNull();

    dispatch("layout:saved", { ok: true });

    expect(screen.getByText("Guardado")).toBeTruthy();
  });

  it("blocks edits while overlay is running", () => {
    render(<PreviewPage />);
    dispatch("profile:loaded", { profile });
    dispatch("overlay:status", { running: true, profileId: "default-racing" });

    const input = screen.getByLabelText("X (px)") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(true);
  });

  it("lists profiles and activates a selected profile from preview", () => {
    render(<PreviewPage />);

    dispatch("hub:profiles", {
      profiles: [
        {
          id: "default-racing",
          file: "example-racing.json",
          name: "Default Racing",
          displayMode: "racing",
          widgets: 3,
        },
      ],
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Default Racing/i })[0]);

    expect(runtimeMock.emit).toHaveBeenCalledWith("hub:activate", {
      id: "default-racing",
      file: "example-racing.json",
    });

    // Start should be disabled until profile:loaded confirms the activation.
    expect(screen.getByRole("button", { name: "Abrir overlay" }).hasAttribute("disabled")).toBe(true);
  });

  it("starts and stops the selected profile from preview", () => {
    render(<PreviewPage />);

    dispatch("hub:profiles", {
      profiles: [
        {
          id: "default-racing",
          file: "example-racing.json",
          name: "Default Racing",
          displayMode: "racing",
          widgets: 3,
        },
      ],
    });
    dispatch("profile:loaded", { profile });

    fireEvent.click(screen.getByRole("button", { name: "Abrir overlay" }));

    expect(runtimeMock.emit).toHaveBeenCalledWith("overlay:start", {
      id: "default-racing",
      file: "example-racing.json",
    });

    dispatch("overlay:status", { running: true, profileId: "default-racing", mode: "racing" });

    fireEvent.click(screen.getByRole("button", { name: "Detener overlay" }));

    expect(runtimeMock.emit).toHaveBeenCalledWith("overlay:stop");
  });

  it("allows starting even when profile:loaded arrives before hub:profiles", () => {
    render(<PreviewPage />);

    dispatch("profile:loaded", { profile });

    fireEvent.click(screen.getByRole("button", { name: "Abrir overlay" }));

    expect(runtimeMock.emit).toHaveBeenCalledWith("overlay:start", {
      id: "default-racing",
      file: "default-racing.json",
    });
  });

  it("blocks start while there are unsaved changes", () => {
    render(<PreviewPage />);
    dispatch("profile:loaded", { profile });

    fireEvent.change(screen.getByLabelText("X (px)"), { target: { value: "42" } });

    const startButton = screen.getByRole("button", { name: "Abrir overlay" });
    expect(startButton.hasAttribute("disabled")).toBe(true);
  });

  it("blocks save while overlay is running", () => {
    render(<PreviewPage />);
    dispatch("profile:loaded", { profile });
    dispatch("overlay:status", { running: true, profileId: "default-racing" });

    const saveButton = screen.getByRole("button", { name: "Guardar" });
    expect(saveButton.hasAttribute("disabled")).toBe(true);
  });

  it("shows an error message when the backend reports a save error", () => {
    render(<PreviewPage />);
    dispatch("profile:loaded", { profile });

    fireEvent.change(screen.getByLabelText("X (px)"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    dispatch("hub:error", { message: "No se pudo escribir el perfil" });

    expect(screen.getByText("No se pudo escribir el perfil")).toBeTruthy();
    expect(screen.getByText("Error al guardar")).toBeTruthy();
  });
});

describe("undo / redo / auto-save", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("undoes last position change with Ctrl+Z", () => {
    render(<PreviewPage />);
    dispatch("profile:loaded", { profile });

    const xInput = screen.getByLabelText("X (px)") as HTMLInputElement;
    expect(xInput.value).toBe("10");

    fireEvent.change(xInput, { target: { value: "42" } });
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();

    // Ctrl+Z to undo
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(xInput.value).toBe("10");
  });

  it("redoes last undo with Ctrl+Y", () => {
    render(<PreviewPage />);
    dispatch("profile:loaded", { profile });

    const xInput = screen.getByLabelText("X (px)") as HTMLInputElement;
    expect(xInput.value).toBe("10");

    fireEvent.change(xInput, { target: { value: "42" } });
    expect(xInput.value).toBe("42");

    // Undo
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(xInput.value).toBe("10");

    // Redo
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(xInput.value).toBe("42");
  });

  it("auto-saves after 800ms debounce", () => {
    render(<PreviewPage />);
    dispatch("profile:loaded", { profile });

    fireEvent.change(screen.getByLabelText("X (px)"), { target: { value: "42" } });

    // Before debounce fires
    expect(runtimeMock.emit).not.toHaveBeenCalledWith("layout:save", expect.anything());

    // Advance past the 800ms debounce
    vi.advanceTimersByTime(900);

    expect(runtimeMock.emit).toHaveBeenCalledWith("layout:save", expect.anything());
  });
});
