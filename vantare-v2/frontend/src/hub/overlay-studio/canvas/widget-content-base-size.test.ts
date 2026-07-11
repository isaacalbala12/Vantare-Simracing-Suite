import { describe, expect, it } from "vitest";
import { relativeDefinition } from "../../../overlay/widget-types/relative/relative-definition";
import {
  computeRelativeIntrinsicHeight,
  computeRelativeIntrinsicWidth,
} from "../../../overlay/widget-types/relative/relative-renderer-helpers";
import { getEnabledRelativeColumns } from "../../../overlay/widget-types/relative/relative-content";
import {
  normalizeStudioWidgetLayout,
  resolveStudioWidgetDisplayLayout,
  resolveWidgetContentBaseSize,
} from "./widget-content-base-size";

describe("resolveWidgetContentBaseSize", () => {
  it("returns intrinsic relative dimensions from widget content", () => {
    const widget = relativeDefinition.createDefault("relative-test");
    const content = widget.content as ReturnType<typeof relativeDefinition.parseContent>;
    const columns = getEnabledRelativeColumns(content);
    const rowCount = content.rangeAhead + content.rangeBehind + (content.includePlayer ? 1 : 0);

    const baseSize = resolveWidgetContentBaseSize(widget);
    expect(baseSize).toEqual({
      width: computeRelativeIntrinsicWidth(columns),
      height: computeRelativeIntrinsicHeight(content.rowHeightMode, rowCount),
    });
  });
});

describe("normalizeStudioWidgetLayout", () => {
  it("recalculates height from width using content aspect ratio", () => {
    const widget = relativeDefinition.createDefault("relative-test");
    const baseSize = resolveWidgetContentBaseSize(widget);
    expect(baseSize).not.toBeNull();

    const layout = { x: 0, y: 0, w: 430, h: 300, zIndex: 0, aspectLocked: true };
    const normalized = normalizeStudioWidgetLayout(layout, baseSize!, widget);
    expect(normalized.w).toBe(430);
    expect(normalized.h).toBe(Math.round((430 * baseSize!.height) / baseSize!.width));
  });
});

describe("resolveStudioWidgetDisplayLayout", () => {
  it("keeps delta layout unchanged", () => {
    const layout = { x: 10, y: 20, w: 420, h: 180, zIndex: 1, aspectLocked: true };
    const widget = {
      id: "delta-main",
      type: "delta" as const,
      layout,
      behavior: { enabled: true, updateHz: 30 },
      content: {},
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
    expect(resolveStudioWidgetDisplayLayout(layout, widget)).toEqual(layout);
  });
});