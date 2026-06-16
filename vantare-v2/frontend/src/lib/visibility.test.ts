import { describe, it, expect } from "vitest";
import { isWidgetVisible } from "./visibility";
import type { WidgetConfig } from "./profile";

function makeWidget(overrides?: Partial<WidgetConfig>): WidgetConfig {
  return {
    id: "test-1",
    type: "delta",
    enabled: true,
    position: { x: 0, y: 0, w: 400, h: 100 },
    ...overrides,
  };
}

describe("isWidgetVisible", () => {
  it("shows widget by default when no visibleWhen rules", () => {
    const widget = makeWidget({ visibleWhen: undefined });
    expect(isWidgetVisible(widget, { sessionType: "race", player: { inPit: false } })).toBe(true);
    expect(isWidgetVisible(widget, { sessionType: "practice", player: { inPit: true } })).toBe(true);
  });

  it("hides widget when inPit mismatch", () => {
    const widget = makeWidget({ visibleWhen: { inPit: false } });
    expect(isWidgetVisible(widget, { sessionType: "race", player: { inPit: true } })).toBe(false);
    expect(isWidgetVisible(widget, { sessionType: "race", player: { inPit: false } })).toBe(true);
  });

  it("hides widget when sessionType does not match", () => {
    const widget = makeWidget({ visibleWhen: { sessionType: ["race"] } });
    expect(isWidgetVisible(widget, { sessionType: "practice", player: { inPit: false } })).toBe(false);
    expect(isWidgetVisible(widget, { sessionType: "race", player: { inPit: false } })).toBe(true);
  });

  it("shows widget when all conditions match", () => {
    const widget = makeWidget({ visibleWhen: { inPit: false, sessionType: ["race"] } });
    expect(isWidgetVisible(widget, { sessionType: "race", player: { inPit: false } })).toBe(true);
  });

  it("hides widget when one condition fails", () => {
    const widget = makeWidget({ visibleWhen: { inPit: false, sessionType: ["race"] } });
    expect(isWidgetVisible(widget, { sessionType: "race", player: { inPit: true } })).toBe(false);
    expect(isWidgetVisible(widget, { sessionType: "practice", player: { inPit: false } })).toBe(false);
  });

  it("handles missing player state gracefully", () => {
    const widget = makeWidget({ visibleWhen: { inPit: false } });
    expect(isWidgetVisible(widget, { sessionType: "race" })).toBe(true);
  });

  it("handles empty sessionType array as no restriction", () => {
    const widget = makeWidget({ visibleWhen: { sessionType: [] } });
    expect(isWidgetVisible(widget, { sessionType: "race" })).toBe(true);
  });
});
