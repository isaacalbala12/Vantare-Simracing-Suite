import { describe, expect, it } from "vitest";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { normalizeWidgetOrder, reorderWidgets } from "./widget-order";

function widget(id: string, zIndex: number): WidgetInstanceV3 {
  return {
    id,
    type: "delta",
    layout: { x: 0, y: 0, w: 100, h: 50, zIndex, aspectLocked: true },
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
}

describe("normalizeWidgetOrder", () => {
  it("assigns contiguous z-index values from zero", () => {
    const normalized = normalizeWidgetOrder([widget("c", 9), widget("a", 1), widget("b", 4)]);
    expect(normalized.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(normalized.map((entry) => entry.layout.zIndex)).toEqual([0, 1, 2]);
  });
});

describe("reorderWidgets", () => {
  const widgets = [widget("a", 0), widget("b", 1), widget("c", 2), widget("d", 3)];

  it("moves targeted widgets to the front while preserving relative order", () => {
    const result = reorderWidgets(widgets, ["b", "d"], "front");
    expect(result.map((entry) => entry.id)).toEqual(["a", "c", "b", "d"]);
    expect(result.map((entry) => entry.layout.zIndex)).toEqual([0, 1, 2, 3]);
  });

  it("moves targeted widgets to the back while preserving relative order", () => {
    const result = reorderWidgets(widgets, ["b", "d"], "back");
    expect(result.map((entry) => entry.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("moves targeted widgets one step forward", () => {
    const result = reorderWidgets(widgets, ["b"], "forward");
    expect(result.map((entry) => entry.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves targeted widgets one step backward", () => {
    const result = reorderWidgets(widgets, ["c"], "backward");
    expect(result.map((entry) => entry.id)).toEqual(["a", "c", "b", "d"]);
  });
});