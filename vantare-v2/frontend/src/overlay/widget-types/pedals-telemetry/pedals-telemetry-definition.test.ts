import { describe, expect, it } from "vitest";
import { pedalsTelemetryDefinition } from "./pedals-telemetry-definition";

describe("pedalsTelemetryDefinition", () => {
  it("creates the live telemetry widget with 30Hz defaults", () => {
    const widget = pedalsTelemetryDefinition.createDefault("pedals-telemetry-1");
    expect(widget.type).toBe("pedals-telemetry");
    expect(widget.behavior.updateHz).toBe(30);
    expect(widget.content).toEqual({ showPosition: true, showClutch: true });
    expect(widget.layout).toMatchObject({ w: 300, h: 112 });
  });

  it("parses optional content safely", () => {
    expect(pedalsTelemetryDefinition.parseContent(undefined)).toEqual({
      showPosition: true,
      showClutch: true,
    });
    expect(
      pedalsTelemetryDefinition.parseContent({ showPosition: false, showClutch: false }),
    ).toEqual({ showPosition: false, showClutch: false });
    expect(() => pedalsTelemetryDefinition.parseContent("invalid")).toThrow(/content/i);
  });
});
