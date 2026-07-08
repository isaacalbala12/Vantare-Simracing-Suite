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
});
