import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetPreviewPanel } from "./WidgetPreviewPanel";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

const mockWidget: WidgetConfig = {
  id: "test-widget",
  type: "delta",
  enabled: true,
  updateHz: 30,
  position: { x: 0, y: 0, w: 400, h: 100 },
};

const mockProfile: ProfileConfig = {
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [mockWidget],
};

describe("WidgetPreviewPanel", () => {
  it("renders an empty state when no widget is selected", () => {
    render(<WidgetPreviewPanel profile={mockProfile} activeWidget={null} />);

    expect(screen.getByTestId("widget-sandbox-preview-empty")).toBeTruthy();
    expect(screen.queryByTestId("widget-sandbox-preview")).toBeNull();
  });

  it("renders the sandbox preview for the active widget without PreviewWidgetFrame", () => {
    render(<WidgetPreviewPanel profile={mockProfile} activeWidget={mockWidget} />);

    expect(screen.getByTestId("widget-sandbox-preview")).toBeTruthy();
    expect(screen.getByTestId("widget-sandbox-renderer")).toBeTruthy();
    expect(screen.queryByTestId("preview-widget-frame-test-widget")).toBeNull();
  });

  it("renders the sandbox when ResizeObserver is unavailable", () => {
    const originalResizeObserver = window.ResizeObserver;
    vi.stubGlobal("ResizeObserver", undefined);

    try {
      render(<WidgetPreviewPanel profile={mockProfile} activeWidget={mockWidget} />);

      expect(screen.getByTestId("widget-sandbox-preview")).toBeTruthy();
      expect(screen.getByTestId("widget-sandbox-renderer")).toBeTruthy();
    } finally {
      vi.stubGlobal("ResizeObserver", originalResizeObserver);
    }
  });

  it("ignores widget.position.x/y in the sandbox preview", () => {
    const profile: ProfileConfig = {
      ...mockProfile,
      widgets: [
        {
          id: "delta-large",
          type: "delta",
          enabled: true,
          updateHz: 15,
          position: { x: 760, y: 40, w: 400, h: 48 },
        },
      ],
    };
    const widget = profile.widgets[0];

    render(<WidgetPreviewPanel profile={profile} activeWidget={widget} />);

    const sandbox = screen.getByTestId("widget-sandbox-preview");
    expect(sandbox.style.backgroundImage).toContain("linear-gradient");
    expect(widget.position).toEqual({ x: 760, y: 40, w: 400, h: 48 });
  });
});
