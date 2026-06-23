import { describe, expect, it } from "vitest";
import { getMockTelemetry, getMockTelemetryForSession } from "./mock-telemetry";

describe("mock telemetry scenarios", () => {
  it("keeps the legacy default mock as practice", () => {
    const telemetry = getMockTelemetry();

    expect(telemetry.sessionName).toBe("PRACTICE1");
  });

  it("creates an explicit practice scenario", () => {
    const telemetry = getMockTelemetryForSession("practice");

    expect(telemetry.sessionName).toBe("PRACTICE1");
    expect(telemetry.sessionType).toBe(10);
    expect(telemetry.sessionKey).toContain("practice");
  });

  it("creates an explicit qualifying scenario", () => {
    const telemetry = getMockTelemetryForSession("qual");

    expect(telemetry.sessionName).toBe("QUALIFY");
    expect(telemetry.sessionType).toBe(11);
    expect(telemetry.sessionKey).toContain("qual");
  });

  it("creates an explicit race scenario with race gaps", () => {
    const telemetry = getMockTelemetryForSession("race");

    expect(telemetry.sessionName).toBe("RACE");
    expect(telemetry.sessionType).toBe(3);
    expect(telemetry.sessionKey).toContain("race");
    expect(telemetry.vehicles[0].timeBehindLeader).toBe(0);
    expect(telemetry.vehicles.some((vehicle) => vehicle.fastestLap)).toBe(true);
  });
});
