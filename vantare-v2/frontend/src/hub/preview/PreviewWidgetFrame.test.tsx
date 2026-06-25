import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import type { WidgetConfig, Rect, ProfileConfig } from "../../lib/profile";
import { PreviewWidgetFrame } from "./PreviewWidgetFrame";
import { getWidgetBaseSize } from "../../overlay/widgets/widget-base-size";

function makeWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "test",
    type: "delta",
    enabled: true,
    position: { x: 0, y: 0, w: 400, h: 100 },
    ...overrides,
  };
}

function profileWith(widget: WidgetConfig): ProfileConfig {
  return { id: "p", name: "P", displayMode: "racing", monitorIndex: 0, widgets: [widget] };
}

describe("PreviewWidgetFrame resize handle", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders resize handle when selected", () => {
    render(
      <PreviewWidgetFrame
        widget={makeWidget()}
        selected={true}
        scale={0.5}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("resize-handle-test")).toBeTruthy();
  });

  it("does not render resize handle when not selected", () => {
    render(
      <PreviewWidgetFrame
        widget={makeWidget()}
        selected={false}
        scale={0.5}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("resize-handle-test")).toBeNull();
  });

  it("does not render resize handle when disabled", () => {
    render(
      <PreviewWidgetFrame
        widget={makeWidget()}
        selected={true}
        scale={0.5}
        onSelect={vi.fn()}
        disabled={true}
      />,
    );
    expect(screen.queryByTestId("resize-handle-test")).toBeNull();
  });
});

describe("PreviewWidgetFrame resize behavior", () => {
  afterEach(() => {
    cleanup();
  });

  it("relative resize is proportional using baseAspect when profile is provided", () => {
    const onChangePosition = vi.fn();
    const widget = makeWidget({
      id: "rel",
      type: "relative",
      position: { x: 0, y: 0, w: 300, h: 200 },
    });
    const profile = profileWith(widget);
    const baseSize = getWidgetBaseSize("relative", widget, profile);
    expect(baseSize).not.toBeNull();
    const baseAspect = baseSize!.width / baseSize!.height;

    render(
      <PreviewWidgetFrame
        widget={widget}
        profile={profile}
        selected={true}
        scale={1}
        onSelect={vi.fn()}
        onChangePosition={onChangePosition}
      />,
    );

    const handle = screen.getByTestId("resize-handle-rel");
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 0 });
    fireEvent.mouseUp(window);

    expect(onChangePosition).toHaveBeenCalledTimes(1);
    const rect = onChangePosition.mock.lastCall?.[1] as Rect;
    // aspect usa baseAspect (no startW/startH)
    // dominant = 100 (X), newH = 200+100 = 300, snap(300)=304
    expect(rect.h).toBe(304);
    expect(rect.w / rect.h).toBeCloseTo(baseAspect, 1);
  });

  it("standings resize is proportional using baseAspect when profile is provided", () => {
    const onChangePosition = vi.fn();
    const widget = makeWidget({
      id: "st",
      type: "standings",
      position: { x: 0, y: 0, w: 400, h: 200 },
    });
    const profile = profileWith(widget);
    const baseSize = getWidgetBaseSize("standings", widget, profile);
    expect(baseSize).not.toBeNull();
    const baseAspect = baseSize!.width / baseSize!.height;

    render(
      <PreviewWidgetFrame
        widget={widget}
        profile={profile}
        selected={true}
        scale={1}
        onSelect={vi.fn()}
        onChangePosition={onChangePosition}
      />,
    );

    const handle = screen.getByTestId("resize-handle-st");
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 0, clientY: 100 });
    fireEvent.mouseUp(window);

    expect(onChangePosition).toHaveBeenCalledTimes(1);
    const rect = onChangePosition.mock.lastCall?.[1] as Rect;
    // aspect usa baseAspect (no startW/startH)
    // dominant = 100 (Y), newH = 200+100 = 300, snap(300)=304
    expect(rect.h).toBe(304);
    expect(rect.w / rect.h).toBeCloseTo(baseAspect, 1);
  });

  it("renders relative with normalized height when position is deformed", () => {
    const widget = makeWidget({
      id: "rel",
      type: "relative",
      position: { x: 0, y: 0, w: 300, h: 600 },
    });
    const profile = profileWith(widget);
    const baseSize = getWidgetBaseSize("relative", widget, profile);
    expect(baseSize).not.toBeNull();
    const expectedH = Math.round(300 * baseSize!.height / baseSize!.width);

    const onChangePosition = vi.fn();
    render(
      <PreviewWidgetFrame
        widget={widget}
        profile={profile}
        selected={true}
        scale={1}
        onSelect={vi.fn()}
        onChangePosition={onChangePosition}
      />,
    );

    const frame = screen.getByTestId("preview-widget-frame-rel");
    expect(parseInt(frame.style.height, 10)).toBe(expectedH);
    expect(onChangePosition).not.toHaveBeenCalled();
  });

  it("delta keeps legacy ratio resize when no profile base size", () => {
    const onChangePosition = vi.fn();
    render(
      <PreviewWidgetFrame
        widget={makeWidget({ id: "delta", type: "delta", position: { x: 0, y: 0, w: 400, h: 100 } })}
        selected={true}
        scale={1}
        onSelect={vi.fn()}
        onChangePosition={onChangePosition}
      />,
    );

    const handle = screen.getByTestId("resize-handle-delta");
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 0, clientY: 50 });
    fireEvent.mouseUp(window);

    expect(onChangePosition).toHaveBeenCalledTimes(1);
    const rect = onChangePosition.mock.lastCall?.[1] as Rect;
    // delta ratio 4: h=150 => w=600
    expect(rect.h).toBe(152);
    expect(rect.w).toBe(600);
  });
});
