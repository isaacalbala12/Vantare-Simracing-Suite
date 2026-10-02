import { describe, expect, it } from "vitest";
import { vantareFunctionalManifest } from "./manifest";

describe("production horizontal carousel setting", () => {
  const widget = vantareFunctionalManifest.widgets.find((entry) => entry.widgetType === "broadcast-tower")!;
  it("exposes a persisted boolean and preserves the existing discrete default", () => {
    expect(widget.defaultSettings).toEqual({ driverCarousel: false });
    expect(widget.parseSettings({ driverCarousel: true })).toMatchObject({ driverCarousel: true });
    expect(widget.parseSettings({})).toMatchObject({ driverCarousel: false });
    expect(widget.inspector?.appearance).toContainEqual(expect.objectContaining({ path: "driverCarousel", kind: "toggle" }));
  });
  it("rejects truthy non-booleans instead of silently enabling motion", () => {
    expect(() => widget.parseSettings({ driverCarousel: "true" })).toThrow();
  });
});
