import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { WidgetPreviewPanel } from "./WidgetPreviewPanel";
import type { WidgetConfig } from "../../lib/profile";

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

describe("WidgetPreviewPanel", () => {
  it("renders a real widget frame with mock telemetry and checkerboard background", () => {
    render(<WidgetPreviewPanel activeWidget={mockWidget} />);

    // Check that the preview frame is rendered (using the testid from PreviewWidgetFrame)
    expect(screen.getByTestId("preview-widget-frame-test-widget")).toBeTruthy();

    // Check that the old placeholder text is gone
    expect(screen.queryByText(/Preview compacto de configuración/i)).toBeNull();
    
    // Check that checkerboard background class is applied
    const container = screen.getByTestId("widget-preview-container");
    expect(container.style.backgroundImage).toContain("linear-gradient");
  });
});
