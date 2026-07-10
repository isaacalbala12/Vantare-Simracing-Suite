import { describe, expect, it } from "vitest";
import { widgetTypeRegistry } from "./widget-registry";

describe("widgetTypeRegistry", () => {
  it("registers Delta only", () => {
    expect(widgetTypeRegistry.list().map((item) => item.type)).toEqual(["delta"]);
  });

  it("exposes Delta inspector sections", () => {
    expect(widgetTypeRegistry.get("delta").capabilities.inspectorSections).toEqual([
      "design",
      "appearance",
      "behavior",
      "layout",
      "actions",
    ]);
  });

  it("rejects unregistered widget types", () => {
    expect(() => widgetTypeRegistry.get("standings")).toThrow(/not registered/i);
  });

  it("creates Delta defaults with tested layout", () => {
    expect(widgetTypeRegistry.get("delta").createDefault("delta-1").layout).toEqual({
      x: 64,
      y: 64,
      w: 280,
      h: 96,
      zIndex: 0,
      aspectLocked: true,
    });
  });
});