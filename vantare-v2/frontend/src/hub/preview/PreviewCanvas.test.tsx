import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewCanvas } from "./PreviewCanvas";
import type { ProfileConfig } from "../../lib/profile";
import { getWidgetBaseSize } from "../../overlay/widgets/widget-base-size";

const profile: ProfileConfig = {
  id: "preview-test",
  name: "Preview Test",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    {
      id: "delta",
      type: "delta",
      enabled: true,
      position: { x: 760, y: 820, w: 400, h: 160 },
      props: {},
    },
  ],
};

describe("PreviewCanvas", () => {
  it("renders a logical 1920x1080 scene scaled inside the preview viewport", () => {
    render(
      <PreviewCanvas
        profile={profile}
        selectedWidgetId="delta"
        onSelectWidget={() => {}}
        onChangeProfile={() => {}}
      />,
    );

    const viewport = screen.getByTestId("preview-viewport");
    const scene = screen.getByTestId("preview-scene");
    const frame = screen.getByTestId("preview-widget-frame-delta");

    expect(viewport.style.width).toBe("960px");
    expect(viewport.style.height).toBe("540px");
    expect(scene.style.width).toBe("1920px");
    expect(scene.style.height).toBe("1080px");
    expect(scene.style.transform).toBe("scale(0.5)");
    expect(scene.style.transformOrigin).toBe("top left");
    expect(frame.style.left).toBe("760px");
    expect(frame.style.top).toBe("820px");
    expect(frame.style.width).toBe("400px");
    expect(frame.style.height).toBe("160px");
  });
});

describe("snap and clamp behavior", () => {
  beforeEach(() => {
    cleanup();
  });


  it("snaps dragged position to 8px grid via onMouseMove", () => {
    const onChangeProfile = vi.fn();
    const dragTarget = { x: 0, y: 0, w: 100, h: 100 };
    const snapProfile: ProfileConfig = {
      id: "snap-test",
      name: "Snap Test",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        { id: "snap", type: "delta", enabled: true, position: { ...dragTarget }, props: {} },
      ],
    };

    render(
      <PreviewCanvas
        profile={snapProfile}
        selectedWidgetId="snap"
        onSelectWidget={() => {}}
        onChangeProfile={onChangeProfile}
      />,
    );

    // Simulate mousedown on widget at viewport origin
    const frame = screen.getByTestId("preview-widget-frame-snap");
    fireEvent.mouseDown(frame, { clientX: 0, clientY: 0 });

    // Drag to viewport position (8, 12) which maps to logical (16, 24)
    const viewport = screen.getByTestId("preview-viewport");
    fireEvent.mouseMove(viewport, { clientX: 8, clientY: 12 });
    fireEvent.mouseUp(viewport);

    // The final snapped position should be 16, 24
    expect(onChangeProfile).toHaveBeenCalled();
    const lastCall = onChangeProfile.mock.lastCall?.[0];
    const moved = lastCall?.widgets?.find((w: { id: string }) => w.id === "snap");
    expect(moved?.position?.x).toBe(16);
    expect(moved?.position?.y).toBe(24);
  });

  it("clamps widget inside canvas bounds (1920x1080)", () => {
    const onChangeProfile = vi.fn();
    const clampProfile: ProfileConfig = {
      id: "clamp-test",
      name: "Clamp Test",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        { id: "clamp", type: "delta", enabled: true, position: { x: 0, y: 0, w: 100, h: 100 }, props: {} },
      ],
    };

    render(
      <PreviewCanvas
        profile={clampProfile}
        selectedWidgetId="clamp"
        onSelectWidget={() => {}}
        onChangeProfile={onChangeProfile}
      />,
    );

    // Simulate mousedown at viewport origin
    const frame = screen.getByTestId("preview-widget-frame-clamp");
    fireEvent.mouseDown(frame, { clientX: 0, clientY: 0 });

    // Drag far beyond bottom-right canvas bounds
    // 1920 - 100 = 1820 max x, 1080 - 100 = 980 max y
    // At scale 0.5: viewport threshold = 1820 * 0.5 = 910, 980 * 0.5 = 490
    const viewport = screen.getByTestId("preview-viewport");
    fireEvent.mouseMove(viewport, { clientX: 920, clientY: 500 });
    fireEvent.mouseUp(viewport);

    expect(onChangeProfile).toHaveBeenCalled();
    const lastCall = onChangeProfile.mock.lastCall?.[0];
    const moved = lastCall?.widgets?.find((w: { id: string }) => w.id === "clamp");
    expect(moved?.position?.x).toBe(1820);
    expect(moved?.position?.y).toBe(980);
  });

  it("commits resize using baseAspect when profile provides base size", () => {
    const onChangeProfile = vi.fn();
    const resizeProfile: ProfileConfig = {
      id: "resize-test",
      name: "Resize Test",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        { id: "resize", type: "standings", enabled: true, position: { x: 0, y: 0, w: 400, h: 200 }, props: {} },
      ],
    };
    const widget = resizeProfile.widgets[0];
    const baseSize = getWidgetBaseSize("standings", widget, resizeProfile);
    expect(baseSize).not.toBeNull();
    const baseAspect = baseSize!.width / baseSize!.height;

    render(
      <PreviewCanvas
        profile={resizeProfile}
        selectedWidgetId="resize"
        onSelectWidget={() => {}}
        onChangeProfile={onChangeProfile}
      />,
    );

    const handle = screen.getByTestId("resize-handle-resize");
    fireEvent.mouseDown(handle, { clientX: 200, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 240, clientY: 130 });
    fireEvent.mouseUp(window);

    expect(onChangeProfile).toHaveBeenCalled();
    const lastCall = onChangeProfile.mock.lastCall?.[0];
    const resized = lastCall?.widgets?.find((w: { id: string }) => w.id === "resize");
    expect(resized?.position?.h).toBeGreaterThan(200);
    expect(resized?.position?.w).toBeGreaterThan(0);
    // aspect debe usar baseAspect (no startW/startH)
    expect(resized?.position?.w / resized?.position?.h).toBeCloseTo(baseAspect, 1);
  });
});
