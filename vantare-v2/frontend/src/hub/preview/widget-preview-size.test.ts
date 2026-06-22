import { describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { createDefaultRelativeColumns } from "../../overlay/widgets/relative-catalog";
import { resolveWidgetPreviewBaseSize } from "./widget-preview-size";

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

describe("resolveWidgetPreviewBaseSize", () => {
  it("returns declared size for non-relative widgets", () => {
    const widget: WidgetConfig = {
      id: "delta",
      type: "delta",
      enabled: true,
      updateHz: 15,
      position: { x: 100, y: 200, w: 320, h: 140 },
      props: {},
    };

    expect(resolveWidgetPreviewBaseSize(profileWith(widget), widget)).toEqual({
      width: 320,
      height: 140,
      mode: "declared",
    });
  });

  it("keeps declared width when relative intrinsic width fits", () => {
    const columns = createDefaultRelativeColumns();
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 80, y: 90, w: 900, h: 420 },
      variantId: "variant-relative",
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-relative", widgetType: "relative", columns }],
    };

    expect(resolveWidgetPreviewBaseSize(profile, widget)).toEqual({
      width: 900,
      height: 420,
      mode: "declared",
    });
  });

  it("expands relative width when active columns need more than declared width", () => {
    const columns = createDefaultRelativeColumns().map((column) =>
      column.id === "bestLap" || column.id === "lastLap" ? { ...column, enabled: true } : column,
    );
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 80, y: 90, w: 220, h: 420 },
      variantId: "variant-relative",
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-relative", widgetType: "relative", columns }],
    };

    const result = resolveWidgetPreviewBaseSize(profile, widget);

    expect(result.width).toBeGreaterThan(220);
    expect(result.height).toBe(420);
    expect(result.mode).toBe("intrinsic");
    expect(widget.position).toEqual({ x: 80, y: 90, w: 220, h: 420 });
  });
});
