import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { importWallpaperFile } = vi.hoisted(() => ({ importWallpaperFile: vi.fn() }));

vi.mock("../canvas/wallpaper-import", async () => {
  const actual =
    await vi.importActual<typeof import("../canvas/wallpaper-import")>(
      "../canvas/wallpaper-import",
    );
  return { ...actual, importWallpaperFile };
});

import { I18nProvider } from "../../../i18n/I18nProvider";
import {
  addWallpaper,
  listWallpapers,
  resetWallpaperCacheForTests,
  wallpaperBackgroundId,
  type StudioWallpaper,
} from "../canvas/studio-wallpapers";
import { StudioWallpaperPicker } from "./StudioWallpaperPicker";

function wallpaper(id: string): StudioWallpaper {
  return {
    id,
    name: id,
    dataUrl: "data:image/jpeg;base64,AAAA",
    width: 1920,
    height: 1080,
    addedAt: 1,
  };
}

function renderPicker(backgroundId: string, onSelect = vi.fn()) {
  render(
    <I18nProvider>
      <StudioWallpaperPicker
        backgroundId={backgroundId}
        fallbackBackgroundId="gradient"
        onSelect={onSelect}
      />
    </I18nProvider>,
  );
  return onSelect;
}

beforeEach(() => {
  window.localStorage.clear();
  resetWallpaperCacheForTests();
  importWallpaperFile.mockReset();
});

afterEach(cleanup);

describe("StudioWallpaperPicker", () => {
  it("opens an empty library and keeps the trigger off", () => {
    renderPicker("grid");
    const trigger = screen.getByTestId("orbit-studio-wallpaper-trigger");
    expect(trigger.className).not.toContain("is-on");

    fireEvent.click(trigger);
    expect(screen.getByTestId("orbit-studio-wallpaper-panel")).toBeTruthy();
    expect(screen.queryByTestId("orbit-studio-wallpaper-grab")).toBeNull();
  });

  it("marks the trigger on while a wallpaper is painting the stage", () => {
    addWallpaper(wallpaper("grab"));
    renderPicker(wallpaperBackgroundId("grab"));

    expect(screen.getByTestId("orbit-studio-wallpaper-trigger").className).toContain("is-on");
  });

  it("selects the wallpaper that was clicked", () => {
    addWallpaper(wallpaper("grab"));
    const onSelect = renderPicker("grid");

    fireEvent.click(screen.getByTestId("orbit-studio-wallpaper-trigger"));
    fireEvent.click(screen.getByTestId("orbit-studio-wallpaper-grab"));

    expect(onSelect).toHaveBeenCalledWith("wallpaper:grab");
  });

  it("imports a file, stores it and puts it straight on the stage", async () => {
    importWallpaperFile.mockResolvedValue(wallpaper("nuevo"));
    const onSelect = renderPicker("grid");

    fireEvent.click(screen.getByTestId("orbit-studio-wallpaper-trigger"));
    fireEvent.change(screen.getByTestId("orbit-studio-wallpaper-input"), {
      target: { files: [new File(["x"], "GRAB_000.JPG", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("wallpaper:nuevo"));
    expect(listWallpapers().map((entry) => entry.id)).toEqual(["nuevo"]);
  });

  it("shows why an import failed and stores nothing", async () => {
    const { WallpaperImportError } =
      await vi.importActual<typeof import("../canvas/wallpaper-import")>(
        "../canvas/wallpaper-import",
      );
    importWallpaperFile.mockRejectedValue(new WallpaperImportError("type"));
    const onSelect = renderPicker("grid");

    fireEvent.click(screen.getByTestId("orbit-studio-wallpaper-trigger"));
    fireEvent.change(screen.getByTestId("orbit-studio-wallpaper-input"), {
      target: { files: [new File(["x"], "notas.txt", { type: "text/plain" })] },
    });

    await waitFor(() => expect(screen.getByTestId("orbit-studio-wallpaper-error")).toBeTruthy());
    expect(listWallpapers()).toEqual([]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("falls back to the factory background when the active wallpaper is removed", () => {
    addWallpaper(wallpaper("grab"));
    const onSelect = renderPicker(wallpaperBackgroundId("grab"));

    fireEvent.click(screen.getByTestId("orbit-studio-wallpaper-trigger"));
    fireEvent.click(screen.getByTestId("orbit-studio-wallpaper-remove-grab"));

    expect(onSelect).toHaveBeenCalledWith("gradient");
    expect(listWallpapers()).toEqual([]);
  });

  it("closes with Escape", () => {
    renderPicker("grid");
    fireEvent.click(screen.getByTestId("orbit-studio-wallpaper-trigger"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("orbit-studio-wallpaper-panel")).toBeNull();
  });
});
