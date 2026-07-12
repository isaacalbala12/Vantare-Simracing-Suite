import { describe, expect, it } from "vitest";
import { getEnabledRelativeColumns } from "../widget-types/relative/relative-content";
import {
  computeRelativeConfiguredRowCount,
  computeRelativeIntrinsicHeight,
  computeRelativeIntrinsicWidth,
} from "../widget-types/relative/relative-renderer-helpers";
import type { WidgetTypeDefinition } from "./widget-definition";
import { WidgetTypeRegistry, widgetTypeRegistry } from "./widget-registry";

describe("widgetTypeRegistry", () => {
  it("registers the implemented widget definitions", () => {
    expect(widgetTypeRegistry.list().map((item) => item.type)).toEqual([
      "delta",
      "standings",
      "relative",
      "pedals",
      "pedals-telemetry",
      "pedals-telemetry-compact",
      "racing-flags",
      "broadcast-tower",
      "head-to-head",
      "input-telemetry",
      "multiclass-relative",
      "delta-advanced",
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

  it("rejects incomplete definitions before they enter a registry", () => {
    const registry = new WidgetTypeRegistry();
    expect(() =>
      registry.register({ type: "delta" } as unknown as WidgetTypeDefinition<Record<string, unknown>>),
    ).toThrow(/incomplete widget type definition/i);
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
    const relative = widgetTypeRegistry.get("relative").createDefault("relative-1");
    const relativeContent = widgetTypeRegistry.get("relative").parseContent(relative.content);
    const relativeColumns = getEnabledRelativeColumns(relativeContent);
    const relativeRows = computeRelativeConfiguredRowCount(relativeContent);
    expect(relative.layout).toEqual({
      x: 64,
      y: 64,
      w: computeRelativeIntrinsicWidth(relativeColumns),
      h: computeRelativeIntrinsicHeight(relativeContent.rowHeightMode, relativeRows),
      zIndex: 0,
      aspectLocked: true,
    });
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
