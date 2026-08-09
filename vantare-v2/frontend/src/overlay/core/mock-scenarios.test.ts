import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "./mock-scenarios";

const SESSIONS = ["practice", "qualifying", "race"] as const;
const LOCATIONS = ["track", "pits"] as const;

describe("buildMockTelemetry", () => {
  it("builds deterministic ready combinations for session and location", () => {
    for (const session of SESSIONS) {
      for (const location of LOCATIONS) {
        const snapshot = buildMockTelemetry({ session, location });
        expect(snapshot.capturedAt).toBe(1_720_569_600_000);
        expect(snapshot.status).toBe("ready");
        expect(snapshot.session.type).toBe(session);
        expect(snapshot.player.inPit).toBe(location === "pits");
        expect(snapshot.player.deltaSeconds).toBe(-0.15);
        expect(snapshot.player.throttle).toBeCloseTo(0.78, 2);
        expect(snapshot.scoring.length).toBeGreaterThan(0);
      }
    }
  });

  it("supports stale disconnected and error states", () => {
    expect(buildMockTelemetry({ session: "race", location: "track", state: "stale" }).status).toBe(
      "stale",
    );
    expect(
      buildMockTelemetry({ session: "race", location: "track", state: "disconnected" }).status,
    ).toBe("disconnected");
    const error = buildMockTelemetry({ session: "race", location: "track", state: "error" });
    expect(error.status).toBe("error");
    expect(error.errorMessage).toMatch(/error/i);
  });

  it("provides multiclass field with 20 HYPERCAR + LMP2 + LMGT3", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    expect(snapshot.scoring.length).toBe(30);
    expect(snapshot.scoring[0]?.place).toBe(1);
    expect(snapshot.scoring[4]?.isPlayer).toBe(true);
    const hypercarCount = snapshot.scoring.filter((row) => row.vehicleClass === "HYPERCAR").length;
    const lmp2Count = snapshot.scoring.filter((row) => row.vehicleClass === "LMP2").length;
    const lmgt3Count = snapshot.scoring.filter((row) => row.vehicleClass === "LMGT3").length;
    expect(hypercarCount).toBe(20);
    expect(lmp2Count).toBe(5);
    expect(lmgt3Count).toBe(5);
  });
});