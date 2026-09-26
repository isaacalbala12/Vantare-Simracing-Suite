import { describe, expect, it } from "vitest";
import { fuelStrategyDefinition } from "./fuel-strategy-definition";

describe("fuelStrategyDefinition", () => {
  it("creates an honest Original widget at 5Hz", () => {
    const widget = fuelStrategyDefinition.createDefault("fuel-1");
    expect(widget.type).toBe("fuel-strategy");
    expect(widget.behavior.updateHz).toBe(5);
    expect(widget.visual.systemId).toBe("vantare-original");
  });

  it("clamps history rows and rejects unsupported units", () => {
    expect(fuelStrategyDefinition.parseContent({ historyRows: 99 })).toMatchObject({ historyRows: 8 });
    expect(() => fuelStrategyDefinition.parseContent({ units: "gallons" })).toThrow(/units/i);
  });

  it("exposes Fuel and Virtual Energy as an explicit content source", () => {
    expect(fuelStrategyDefinition.parseContent({}).source).toBe("fuel");
    expect(fuelStrategyDefinition.parseContent({ source: "virtual-energy" }).source).toBe("virtual-energy");
    expect(() => fuelStrategyDefinition.parseContent({ source: "battery" })).toThrow(/source/i);
    expect(fuelStrategyDefinition.inspector.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "select", path: "source" }),
    ]));
  });
});
