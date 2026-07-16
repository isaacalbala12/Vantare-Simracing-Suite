import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioPreviewState } from "../state/studio-store";
import { PreviewSourceControls } from "./PreviewSourceControls";

const preview: StudioPreviewState = {
  source: "mock",
  mockSession: "practice",
  mockLocation: "track",
  zoom: "fit",
  backgroundId: "grid",
  safeArea: false,
};

describe("PreviewSourceControls", () => {
  afterEach(() => cleanup());

  it("exposes mock session and location selectors", () => {
    const onPreviewChange = vi.fn();
    render(
      <PreviewSourceControls preview={preview} liveAvailable={false} onPreviewChange={onPreviewChange} />,
    );

    fireEvent.change(screen.getByTestId("studio-mock-session-select"), {
      target: { value: "race" },
    });
    expect(onPreviewChange).toHaveBeenCalledWith({ mockSession: "race" });

    fireEvent.change(screen.getByTestId("studio-mock-location-select"), {
      target: { value: "pits" },
    });
    expect(onPreviewChange).toHaveBeenCalledWith({ mockLocation: "pits" });
  });

  it("invokes the Browser View callback from the footer control", () => {
    const onOpenBrowserView = vi.fn();
    render(
      <PreviewSourceControls
        preview={preview}
        liveAvailable={false}
        onPreviewChange={vi.fn()}
        onOpenBrowserView={onOpenBrowserView}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-browser-view-button"));
    expect(onOpenBrowserView).toHaveBeenCalledOnce();
  });

  it("disables live with an explanation when LMU is unavailable", () => {
    render(
      <PreviewSourceControls
        preview={{ ...preview, source: "live" }}
        liveAvailable={false}
        onPreviewChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-preview-source-live").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("studio-preview-live-unavailable").textContent).toContain("LMU");
  });
});