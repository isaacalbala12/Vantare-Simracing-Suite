import { describe, expect, it } from "vitest";
import { broadcastTowerDefinition } from "./broadcast-tower-definition";

describe("broadcastTowerDefinition", () => {
  it("creates a five-row 10Hz tower", () => {
    const widget = broadcastTowerDefinition.createDefault("tower-1");
    expect(widget.type).toBe("broadcast-tower");
    expect(widget.behavior.updateHz).toBe(10);
    expect(widget.content).toEqual({ rowCount: 5, showWeather: true, showSof: true });
  });
  it("clamps row count to the contract", () => {
    expect(broadcastTowerDefinition.parseContent({ rowCount: 99 })).toMatchObject({ rowCount: 10 });
    expect(broadcastTowerDefinition.parseContent({ rowCount: 1 })).toMatchObject({ rowCount: 3 });
  });
});
