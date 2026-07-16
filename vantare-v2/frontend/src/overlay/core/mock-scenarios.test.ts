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
});