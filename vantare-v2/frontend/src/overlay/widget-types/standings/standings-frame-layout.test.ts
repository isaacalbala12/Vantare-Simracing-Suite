import { describe, expect, it } from "vitest";
import { standingsDefinition } from "./standings-definition";
import { resolveStandingsFrameLayout, resolveStandingsMoveLayout } from "./standings-frame-layout";

describe("Functional frame geometry", () => {
  it.each(["signature", "broadcast"])("fits configured columns and twenty rows in %s on a legacy frame", (templateId) => {
    const widget = standingsDefinition.createDefault("standings");
    widget.visual = { ...widget.visual, systemId: "vantare-functional", baseSettings: { templateId } };
    widget.layout = { ...widget.layout, x: 1560, y: 640, w: 340, h: 420 };
    widget.content = { ...widget.content, rowCount: 20 };
    const frame = resolveStandingsFrameLayout(widget, widget.layout, 1920, 1080);
    expect(frame.w).toBeGreaterThanOrEqual(464);
    expect(frame.h).toBe(templateId === "broadcast" ? 670 : 650);
    expect(frame.x + frame.w).toBeLessThanOrEqual(1920);
    expect(frame.y + frame.h).toBeLessThanOrEqual(1080);
    const moved = resolveStandingsMoveLayout(widget, widget.layout, { ...widget.layout, x: widget.layout.x - 100, y: widget.layout.y - 100 }, 1920, 1080);
    expect(moved.x).toBe(frame.x - 100);
    expect(moved.w).toBe(frame.w);
    expect(moved.h).toBe(frame.h);
    expect(moved.y).toBe(frame.y - 100);
    expect(widget.layout.w).toBe(340);
  });

  it.each(["driverName", "lastLap", "bestLap"])("lets the inspector widen %s without changing other content", (metricId) => {
    const widget = standingsDefinition.createDefault("columns");
    const content = standingsDefinition.parseContent(undefined);
    widget.visual = { ...widget.visual, systemId: "vantare-functional" };
    widget.layout.w = 280;
    const widths = (["sm", "md", "lg"] as const).map((widthPreset) => {
      widget.content = { ...content, columns: content.columns.map((column) => column.metricId === metricId ? { ...column, enabled: true, widthPreset } : column) };
      return resolveStandingsFrameLayout(widget, widget.layout).w;
    });
    expect(widths[1]).toBeGreaterThan(widths[0]!);
    expect(widths[2]).toBeGreaterThan(widths[1]!);
  });

  it("preserves layouts of other systems", () => {
    const widget = standingsDefinition.createDefault("standings");
    expect(resolveStandingsFrameLayout(widget, widget.layout, 1920)).toBe(widget.layout);
  });

  it("reserves the separate Signature header when a timing column comes first", () => {
    const widget = standingsDefinition.createDefault("timing-first");
    const content = standingsDefinition.parseContent(undefined);
    widget.content = { ...content, columns: [...content.columns].sort((a, b) => Number(b.metricId === "gap") - Number(a.metricId === "gap")) };
    widget.visual = { ...widget.visual, systemId: "vantare-functional", baseSettings: { templateId: "signature" } };
    expect(resolveStandingsFrameLayout(widget, widget.layout).h).toBe(699);
  });
});
