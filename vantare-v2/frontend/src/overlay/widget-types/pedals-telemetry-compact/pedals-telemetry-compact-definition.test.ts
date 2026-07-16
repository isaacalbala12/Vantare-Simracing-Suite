import { describe, expect, it } from "vitest";
import { pedalsTelemetryCompactDefinition } from "./pedals-telemetry-compact-definition";

describe("pedalsTelemetryCompactDefinition", () => {
  it("creates an independent 30Hz compact widget", () => {
    const widget = pedalsTelemetryCompactDefinition.createDefault("compact-1");
    expect(widget.type).toBe("pedals-telemetry-compact");
    expect(widget.behavior.updateHz).toBe(30);
    expect(widget.content).toEqual({ showSpeed: true, showRpm: true, showClutch: true });
    expect(widget.layout).toMatchObject({ w: 260, h: 92 });
  });

  it("validates compact content flags", () => {
    expect(pedalsTelemetryCompactDefinition.parseContent({ showSpeed: false })).toEqual({
      showSpeed: false,
      showRpm: true,
      showClutch: true,
    });
    expect(() => pedalsTelemetryCompactDefinition.parseContent({ showRpm: "yes" })).toThrow(/boolean/i);
  });
});
