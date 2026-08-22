import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import type { RaceScheduleContent } from "./race-schedule-definition";
import { buildRaceScheduleViewModelV2 } from "./race-schedule-view-model-v2";
import { buildRaceScheduleViewModel } from "./race-schedule-view-model";
import { buildMockTelemetry } from "../../core/mock-scenarios";

function frameFixture(): OverlayFrameV2 {
  return {
    algorithm: 1,
    contract: 1,
    epoch: 1,
    sequence: 1,
    sessionId: "s1",
    generatedAt: new Date().toISOString(),
    capabilities: { available: {}, modes: { delta: [], gaps: "none", spatial: [], standings: "none" }, supported: [] },
    controls: { history: { q: "missing" } },
    delta: { available: [], seconds: { q: "missing" } },
    fuel: { capacity: { q: "missing" }, estimatedLaps: { q: "missing" }, perLap: { q: "missing" }, remaining: { q: "missing" } },
    player: { id: "1", brake: { q: "missing" }, clutch: { q: "missing" }, gear: { q: "missing" }, rpm: { q: "missing" }, speed: { q: "missing" }, steering: { q: "missing" }, throttle: { q: "missing" } },
    relative: [],
    session: { flag: { q: "missing" }, maxLaps: { q: "missing" }, phase: { q: "missing" }, remaining: { q: "missing" }, track: { q: "missing" } },
    spotter: { left: { q: "missing" }, mode: "none", right: { q: "missing" } },
    standings: [],
    units: { fuel: "liters", pressure: "kpa", speed: "kph", temperature: "celsius" },
  };
}

const live: OverlaySourceStatusV2 = { state: "live" };
const content: RaceScheduleContent = { rowCount: 4, licenseFilter: "all", timeZone: "local" };

describe("buildRaceScheduleViewModelV2", () => {
  it("devuelve missing con eventos vacios cuando el frame no trae calendario", () => {
    const model = buildRaceScheduleViewModelV2(frameFixture(), live, content);
    expect(model.status).toBe("missing");
    expect(model.events).toEqual([]);
    expect(model.timeZone).toBe("local");
  });

  it("respeta timeZone del content", () => {
    const model = buildRaceScheduleViewModelV2(frameFixture(), live, { ...content, timeZone: "UTC" });
    expect(model.timeZone).toBe("UTC");
  });

  it("equivalencia con v1 cuando no hay dataset: ambos en missing y vacios", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const v1 = buildRaceScheduleViewModel(snapshot, content);
    const v2 = buildRaceScheduleViewModelV2(frameFixture(), live, content);
    expect(v1.status).toBe("missing");
    expect(v2.status).toBe("missing");
    expect(v1.events.length).toBe(0);
    expect(v2.events.length).toBe(0);
  });

  it("cuando v1 tiene eventos, v2 sigue vacio y declara el gap", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const withEvents = {
      ...snapshot,
      auxiliary: {
        scheduleEvents: [
          { id: "a", title: "Race A", track: "Le Mans", startAt: "2026-07-15T10:00:00Z", durationMinutes: 45, classes: ["Hypercar"], status: "upcoming" },
        ],
      },
    };
    const v1 = buildRaceScheduleViewModel(withEvents, { rowCount: 1, licenseFilter: "all", timeZone: "UTC" });
    expect(v1.status).toBe("ready");
    const v2 = buildRaceScheduleViewModelV2(frameFixture(), live, { rowCount: 1, licenseFilter: "all", timeZone: "UTC" });
    expect(v2.events).toEqual([]);
    expect(v2.status).toBe("missing");
  });
});
