import { describe, it, expect } from "bun:test";
import { buildSyntheticLMUBuffer, extractScoringInfo, extractPlayerTelemetry, extractWheelTemp, extractVehicleAt } from "./lmu-synthetic-buffer";

describe("LMU Synthetic Buffer", () => {
  it("creates buffer of correct size", () => {
    const { buffer } = buildSyntheticLMUBuffer();
    expect(buffer.length).toBe(324820);
  });

  it("matches expected values", () => {
    const { buffer, expected } = buildSyntheticLMUBuffer();
    const si = extractScoringInfo(buffer);
    expect(si.trackName).toBe(expected.trackName);
    expect(si.session).toBe(expected.session);
    expect(si.numVehicles).toBe(expected.numVehicles);
  });

  it("extracts scoring info", () => {
    const { buffer } = buildSyntheticLMUBuffer();
    const si = extractScoringInfo(buffer);
    expect(si.trackName).toBe("Spa");
    expect(si.session).toBe(10);
    expect(si.gamePhase).toBe(5);
    expect(si.numVehicles).toBe(3);
  });

  it("computes speed from local vel", () => {
    const { buffer } = buildSyntheticLMUBuffer();
    const pt = extractPlayerTelemetry(buffer);
    expect(pt.speed).toBeCloseTo(15, 10);
    expect(pt.id).toBe(0);
    expect(pt.gear).toBe(4);
    expect(pt.rpm).toBe(7200);
    expect(pt.fuel).toBeCloseTo(45.2, 1);
  });

  it("extracts vehicle scoring", () => {
    const { buffer } = buildSyntheticLMUBuffer();
    const v0 = extractVehicleAt(buffer, 0);
    expect(v0.name).toBe("TestDriver");
    expect(v0.place).toBe(1);
    const v1 = extractVehicleAt(buffer, 1);
    expect(v1.name).toBe("AI One");
    expect(v1.place).toBe(2);
  });

  it("extracts wheel temperature", () => {
    const { buffer } = buildSyntheticLMUBuffer();
    const t = extractWheelTemp(buffer, 0);
    expect(t).toBe(100);
  });
});
