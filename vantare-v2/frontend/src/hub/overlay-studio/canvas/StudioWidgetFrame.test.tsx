import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { WidgetVisualHost } from "../../../overlay/core/WidgetVisualHost";
import { StudioWidgetFrame } from "./StudioWidgetFrame";

vi.mock("../../../overlay/core/WidgetVisualHost", () => ({
  WidgetVisualHost: vi.fn(() => <div data-testid="widget-visual-host-mock" />),
}));

const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });

function buildWidget(overrides: Partial<WidgetInstanceV3> = {}): WidgetInstanceV3 {
  return {
    ...deltaDefinition.createDefault("delta-main"),
    layout: {
      x: 120,
      y: 80,
      w: 280,
      h: 96,
      zIndex: 3,
      aspectLocked: true,
    },
    ...overrides,
  };
}

describe("StudioWidgetFrame", () => {
  afterEach(() => cleanup());

  it("positions the frame from layout x/y/w/h/zIndex", () => {
    const widget = buildWidget();
    render(
      <StudioWidgetFrame
        widget={widget}
        layout={widget.layout}
        selected={false}
        snapshot={snapshot}
        onSelect={vi.fn()}
      />,
    );

    const frame = screen.getByTestId("studio-widget-frame-delta-main");
    expect(frame.style.left).toBe("120px");
    expect(frame.style.top).toBe("80px");
    expect(frame.style.width).toBe("280px");
    expect(frame.style.height).toBe("96px");
    expect(frame.style.zIndex).toBe("3");
  });

  it("renders WidgetVisualHost in studio mode inside the visual surface", () => {
    const widget = buildWidget();
    render(
      <StudioWidgetFrame
        widget={widget}
        layout={widget.layout}
        selected={false}
        snapshot={snapshot}
        onSelect={vi.fn()}
      />,
    );

    expect(WidgetVisualHost).toHaveBeenCalledWith(
      expect.objectContaining({
        widget: expect.objectContaining({ id: widget.id, layout: widget.layout }),
        snapshot,
        renderMode: "studio",
      }),
      undefined,
    );
    expect(screen.getByTestId("studio-widget-visual-delta-main")).toBeTruthy();
    expect(screen.getByTestId("widget-visual-host-mock")).toBeTruthy();
  });

  it("keeps selection chrome outside the visual host surface", () => {
    const widget = buildWidget();
    render(
      <StudioWidgetFrame
        widget={widget}
        layout={widget.layout}
        selected
        snapshot={snapshot}
        onSelect={vi.fn()}
      />,
    );

    const visual = screen.getByTestId("studio-widget-visual-delta-main");
    const chrome = screen.getByTestId("studio-widget-frame-chrome-delta-main");
    expect(visual.contains(chrome)).toBe(false);
  });

  it("shows a hidden badge for disabled widgets while keeping the frame selectable", () => {
    const onSelect = vi.fn();
    const widget = buildWidget({ behavior: { enabled: false, updateHz: 30 } });
    render(
      <StudioWidgetFrame
        widget={widget}
        layout={widget.layout}
        selected={false}
        snapshot={snapshot}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId("studio-widget-hidden-badge-delta-main").textContent).toBe("Oculto");
    fireEvent.pointerDown(screen.getByTestId("studio-widget-frame-delta-main"));
    expect(onSelect).toHaveBeenCalledWith("delta-main");
  });
});