import { describe, expect, it } from "vitest";
import { widgetTypeRegistry } from "./widget-registry";

describe("widgetTypeRegistry", () => {
  it("registers the four core widget definitions", () => {
    expect(widgetTypeRegistry.list().map((item) => item.type)).toEqual([
      "delta",
      "standings",
      "relative",
      "pedals",
    ]);
  });

  it("exposes inspector sections for every registered widget", () => {
    for (const definition of widgetTypeRegistry.list()) {
      expect(definition.capabilities.inspectorSections).toContain("design");
      expect(definition.capabilities.inspectorSections).toContain("appearance");
      expect(definition.capabilities.inspectorSections).toContain("behavior");
      expect(definition.capabilities.inspectorSections).toContain("layout");
      expect(definition.capabilities.inspectorSections).toContain("actions");
    }
  });

  it("rejects unregistered widget types", () => {
    expect(() => widgetTypeRegistry.get("telemetry" as "delta")).toThrow(/not registered/i);
  });

  it("creates tested defaults for each core widget", () => {
    expect(widgetTypeRegistry.get("delta").createDefault("delta-1").layout).toEqual({
      x: 64,
      y: 64,
      w: 280,
      h: 96,
      zIndex: 0,
      aspectLocked: true,
    });
    expect(widgetTypeRegistry.get("standings").createDefault("standings-1").layout.w).toBe(520);
    expect(widgetTypeRegistry.get("relative").createDefault("relative-1").layout.w).toBe(430);
    expect(widgetTypeRegistry.get("pedals").createDefault("pedals-1").layout).toEqual({
      x: 64,
      y: 64,
      w: 120,
      h: 160,
      zIndex: 0,
      aspectLocked: true,
    });
  });

  it("exposes a view model builder for every registered widget", () => {
    for (const definition of widgetTypeRegistry.list()) {
      expect(typeof definition.buildViewModel).toBe("function");
    }
  });
});