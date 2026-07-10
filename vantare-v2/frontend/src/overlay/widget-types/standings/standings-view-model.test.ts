import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { createDefaultStandingsContent } from "./standings-content";
import { buildStandingsViewModel } from "./standings-view-model";

const content = createDefaultStandingsContent();

describe("buildStandingsViewModel", () => {
  it("builds race rows with player and leader flags", () => {
    const model = buildStandingsViewModel(
      buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
      content,
    );
    expect(model.status).toBe("ready");
    expect(model.type).toBe("standings");
    expect(model.rows.length).toBeGreaterThan(0);
    expect(model.rows.some((row) => row.isPlayer)).toBe(true);
    expect(model.rows[0]?.isLeader).toBe(true);
    expect(model.remainingText).not.toBe("—");
  });

  it("uses best-lap formatting in practice sessions", () => {
    const model = buildStandingsViewModel(
      buildMockTelemetry({ session: "practice", location: "track", state: "ready" }),
      content,
    );
    expect(model.sessionLabel).toBe("PRACTICE");
    expect(model.rows[0]?.gapText).toMatch(/^\d+:\d+\.\d+$/);
  });

  it("propagates disconnected snapshots without throwing", () => {
    const model = buildStandingsViewModel(
      buildMockTelemetry({ session: "race", location: "track", state: "disconnected" }),
      content,
    );
    expect(model.status).toBe("disconnected");
    expect(model.rows).toEqual([]);
  });

  it("handles malformed scoring rows and large inputs safely", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const manyRows = Array.from({ length: 60 }, (_, index) => ({
      id: index + 1,
      place: index + 1,
      driverName: `Driver ${index + 1}`,
      vehicleClass: "HYPERCAR",
      isPlayer: index === 4,
    }));
    const model = buildStandingsViewModel(
      { ...snapshot, scoring: [...manyRows, { invalid: true }] },
      content,
    );
    expect(model.rows).toHaveLength(60);
  });
});