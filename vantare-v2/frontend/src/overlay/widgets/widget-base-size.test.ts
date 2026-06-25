import { describe, it, expect } from "vitest";
import { getWidgetBaseSize, normalizeWidgetVisualRect } from "./widget-base-size";
import type { ProfileConfig, WidgetConfig, Rect } from "../../lib/profile";


function relativeWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "rel",
    type: "relative",
    enabled: true,
    updateHz: 15,
    position: { x: 0, y: 0, w: 300, h: 200 },
    ...overrides,
  };
}

function standingsWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "st",
    type: "standings",
    enabled: true,
    updateHz: 15,
    position: { x: 0, y: 0, w: 400, h: 300 },
    ...overrides,
  };
}

function profileWith(widget: WidgetConfig): ProfileConfig {
  return {
    id: "p",
    name: "P",
    displayMode: "racing",
    monitorIndex: 0,
    widgets: [widget],
  };
}

describe("getWidgetBaseSize", () => {
  it("returns null for unsupported widget types", () => {
    const widget: WidgetConfig = { id: "d", type: "delta", enabled: true, updateHz: 30, position: { x: 0, y: 0, w: 400, h: 48 } };
    expect(getWidgetBaseSize("delta", widget, profileWith(widget))).toBeNull();
  });

  it("computes base size for relative compact using intrinsic width and compact height", () => {
    const widget = relativeWidget();
    const profile = profileWith(widget);
    const size = getWidgetBaseSize("relative", widget, profile);
    expect(size).not.toBeNull();
    // width = sum of default column widths + padding
    expect(size!.width).toBeGreaterThan(0);
    // compact by default in base size: header + (rangeAhead+rangeBehind+includePlayer) * rowHeight
    // defaults: rangeAhead=3, rangeBehind=3, includePlayer=true => 7 rows
    expect(size!.height).toBeGreaterThan(100);
  });

  it("computes base size for relative fill", () => {
    const widget = relativeWidget();
    const profile = profileWith(widget);
    const widgetFill = { ...widget, props: { rowHeightMode: "fill" } };
    const size = getWidgetBaseSize("relative", widgetFill, profile);
    expect(size).not.toBeNull();
    expect(size!.width).toBeGreaterThan(0);
    expect(size!.height).toBeGreaterThan(50);
  });

  it("computes base size for standings with default maxRows", () => {
    const widget = standingsWidget();
    const profile = profileWith(widget);
    const size = getWidgetBaseSize("standings", widget, profile);
    expect(size).not.toBeNull();
    expect(size!.width).toBeGreaterThan(0);
    // header(80) + class(24) + containerTopMargin(4) + 12*24(288) + footerTopMargin(4) + footer(21) + panelBorder(2) = 423
    expect(size!.height).toBe(423);
  });

  it("computes base size for standings with custom maxRows=5", () => {
    const widget = standingsWidget({ props: { maxRows: 5 } });
    const profile = profileWith(widget);
    const size = getWidgetBaseSize("standings", widget, profile);
    expect(size).not.toBeNull();
    // header(80) + class(24) + containerTopMargin(4) + 5*24(120) + footerTopMargin(4) + footer(21) + panelBorder(2) = 255
    expect(size!.height).toBe(255);
  });
});

describe("normalizeWidgetVisualRect", () => {
  it("returns position unchanged when baseSize is null", () => {
    const pos: Rect = { x: 10, y: 20, w: 300, h: 200 };
    expect(normalizeWidgetVisualRect(pos, null)).toEqual(pos);
  });

  it("recalculates h according to base aspect, keeps x/y/w", () => {
    const pos: Rect = { x: 0, y: 0, w: 300, h: 200 };
    const baseSize = { width: 258, height: 240 };
    const result = normalizeWidgetVisualRect(pos, baseSize);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.w).toBe(300);
    // h = round(300 * 240 / 258) = round(279.07) = 279
    expect(result.h).toBe(279);
    expect(result.w / result.h).toBeCloseTo(258 / 240, 2);
  });

  it("does not mutate input", () => {
    const pos: Rect = { x: 10, y: 20, w: 300, h: 200 };
    const baseSize = { width: 258, height: 240 };
    const original = { ...pos };
    normalizeWidgetVisualRect(pos, baseSize);
    expect(pos).toEqual(original);
  });

  it("respects minimum height", () => {
    const pos: Rect = { x: 0, y: 0, w: 80, h: 10 };
    const baseSize = { width: 400, height: 300 };
    const result = normalizeWidgetVisualRect(pos, baseSize);
    // h = round(80 * 300 / 400) = round(60) = 60
    expect(result.h).toBe(60);
    expect(result.h).toBeGreaterThanOrEqual(40);
  });
});
