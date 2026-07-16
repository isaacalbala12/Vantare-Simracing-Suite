import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppBadge } from "./AppBadge";
import type { LauncherAppEntry } from "../launcher/launcher-state";

describe("AppBadge", () => {
  it("renders favorite toggle that emits update event on click", () => {
    const app: LauncherAppEntry = {
      id: "obs",
      displayName: "OBS",
      abbreviation: "OBS",
      category: "streaming",
      launchMethod: "executable",
      detected: true,
      gradientFrom: "#000",
      gradientTo: "#fff",
      isFavorite: false,
    };
    const onFavorite = vi.fn();
    render(<AppBadge app={app} onFavorite={onFavorite} />);
    fireEvent.click(screen.getByTestId("app-favorite-obs"));
    expect(onFavorite).toHaveBeenCalledWith("obs", true);
  });

  it("falls back after a broken icon candidate instead of keeping a broken image", () => {
    const app: LauncherAppEntry = {
      id: "manual",
      displayName: "Manual",
      abbreviation: "MAN",
      category: "utility",
      launchMethod: "executable",
      executablePath: "C:\\Manual\\manual.exe",
      iconUrl: "data:image/png;base64,broken",
      detected: false,
      gradientFrom: "#000",
      gradientTo: "#fff",
    };

    render(<AppBadge app={app} />);
    const image = screen.getByTestId("app-badge-manual").querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("app-badge-manual").textContent).toContain("MAN");
  });
});
