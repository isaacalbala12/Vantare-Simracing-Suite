import { describe, expect, it } from "vitest";
import { createWidgetDiagnosticCollector, type WidgetDiagnostic } from "./widget-diagnostics";

const diagnostic: WidgetDiagnostic = {
  code: "invalid-content",
  widgetId: "delta-1",
  widgetType: "delta",
  systemId: "vantare-original",
  surface: "studio",
  message: "Invalid content",
  occurredAt: "2026-07-11T00:00:00.000Z",
};

describe("widget diagnostics", () => {
  it("keeps only the newest bounded entries", () => {
    const collector = createWidgetDiagnosticCollector(2);
    collector.report(diagnostic);
    collector.report({ ...diagnostic, code: "renderer-exception" });
    collector.report({ ...diagnostic, code: "conflict" });

    expect(collector.list().map((entry) => entry.code)).toEqual(["renderer-exception", "conflict"]);
    expect(collector.counts()).toEqual({ "renderer-exception": 1, conflict: 1 });
  });

  it("does not retain payloads outside the diagnostic contract", () => {
    const collector = createWidgetDiagnosticCollector();
    collector.report({ ...diagnostic, message: "safe summary" });

    expect(JSON.stringify(collector.list())).not.toMatch(/telemetry|driver|token|profileJson/i);
    expect(Object.keys(collector.list()[0] ?? {}).sort()).toEqual([
      "code",
      "message",
      "occurredAt",
      "surface",
      "systemId",
      "widgetId",
      "widgetType",
    ]);
  });

  it("supports clearing and normalizes invalid limits", () => {
    const collector = createWidgetDiagnosticCollector(Number.POSITIVE_INFINITY);
    collector.report(diagnostic);
    expect(collector.list()).toHaveLength(1);
    collector.clear();
    expect(collector.list()).toEqual([]);
    expect(collector.counts()).toEqual({});
  });
});
