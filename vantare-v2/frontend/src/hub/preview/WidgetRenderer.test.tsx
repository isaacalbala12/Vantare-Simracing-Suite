import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { WidgetRenderer } from "./WidgetRenderer";

function profileWith(widget: WidgetConfig): ProfileConfig {
  return {
    id: "profile-test",
    name: "Test",
    displayMode: "racing",
    monitorIndex: 0,
    widgets: [widget],
    variants: [],
  };
}

afterEach(() => {
  cleanup();
});

describe("WidgetRenderer", () => {
  it("renders a known widget without layout frame chrome", () => {
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 300, y: 400, w: 600, h: 420 },
      props: {},
    };

    render(<WidgetRenderer profile={profileWith(widget)} widget={widget} testId="renderer" />);

    expect(screen.getByTestId("renderer")).toBeTruthy();
    expect(screen.getByText("RELATIVE")).toBeTruthy();
    expect(screen.queryByTestId("preview-widget-frame-relative")).toBeNull();
  });

  it("fills the host by default", () => {
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 300, y: 400, w: 600, h: 420 },
      props: {},
    };

    render(<WidgetRenderer profile={profileWith(widget)} widget={widget} testId="renderer" />);

    expect(screen.getByTestId("renderer").className).toContain("h-full");
    expect(screen.getByTestId("renderer").className).toContain("w-full");
  });

  it("can opt out of filling host height for intrinsic measurement", () => {
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 300, y: 400, w: 600, h: 420 },
      props: {},
    };

    render(<WidgetRenderer profile={profileWith(widget)} widget={widget} fillHost={false} testId="renderer" />);

    expect(screen.getByTestId("renderer").className).not.toContain("h-full");
    expect(screen.getByTestId("renderer").className).not.toContain("w-full");
    expect(screen.getByTestId("renderer").style.width).toBe("fit-content");
  });

  it("renders an unknown widget fallback", () => {
    const widget: WidgetConfig = {
      id: "unknown",
      type: "unknown-widget",
      enabled: true,
      updateHz: 15,
      position: { x: 0, y: 0, w: 300, h: 200 },
      props: {},
    };

    render(<WidgetRenderer profile={profileWith(widget)} widget={widget} testId="renderer" />);

    expect(screen.getByTestId("renderer").textContent).toContain("unknown-widget");
  });
});
