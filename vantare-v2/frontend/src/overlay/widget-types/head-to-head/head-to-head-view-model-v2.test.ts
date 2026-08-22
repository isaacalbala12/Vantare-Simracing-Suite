import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import { buildHeadToHeadViewModelV2 } from "./head-to-head-view-model-v2";
import { buildHeadToHeadViewModel } from "./head-to-head-view-model";
import { buildMockTelemetry } from "../../core/mock-scenarios";

function frameFixture(overrides?: Partial<OverlayFrameV2>): OverlayFrameV2 {
  const base: OverlayFrameV2 = {
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
    player: { id: "4", brake: { q: "missing" }, clutch: { q: "missing" }, gear: { q: "missing" }, rpm: { q: "missing" }, speed: { q: "missing" }, steering: { q: "missing" }, throttle: { q: "missing" } },
    relative: [
      { id: "3", side: "ahead", authority: "native", classId: "HYPERCAR", name: "CADILLAC", gap: { q: "fresh", v: 0.8 } },
      { id: "4", side: "player", authority: "native", classId: "HYPERCAR", name: "TOYOTA", gap: { q: "fresh", v: 0 } },
      { id: "5", side: "behind", authority: "native", classId: "HYPERCAR", name: "PEUGEOT", gap: { q: "fresh", v: -1.2 } },
    ],
    session: { flag: { q: "missing" }, maxLaps: { q: "missing" }, phase: { q: "missing" }, remaining: { q: "missing" }, track: { q: "missing" } },
    spotter: { left: { q: "missing" }, mode: "none", right: { q: "missing" } },
    standings: [
      { id: "0", position: 1, classId: "HYPERCAR", classPosition: 1, driver: "ALPINE", number: "36", gap: { q: "fresh", v: 0 }, lastLap: { q: "fresh", v: 90 } },
      { id: "3", position: 4, classId: "HYPERCAR", classPosition: 4, driver: "CADILLAC RACING", number: "2", gap: { q: "fresh", v: 1.1 }, lastLap: { q: "fresh", v: 91 } },
      { id: "4", position: 5, classId: "HYPERCAR", classPosition: 5, driver: "TOYOTA GAZOO", number: "8", gap: { q: "fresh", v: 0 }, lastLap: { q: "fresh", v: 92 } },
      { id: "5", position: 6, classId: "HYPERCAR", classPosition: 6, driver: "PEUGEOT", number: "94", gap: { q: "fresh", v: 2.3 }, lastLap: { q: "fresh", v: 93 } },
    ],
    units: { fuel: "liters", pressure: "kpa", speed: "kph", temperature: "celsius" },
  };
  return { ...base, ...overrides, standings: overrides?.standings ?? base.standings, relative: overrides?.relative ?? base.relative };
}

const live: OverlaySourceStatusV2 = { state: "live" };

describe("buildHeadToHeadViewModelV2", () => {
  it("selecciona rival inmediato ahead y behind", () => {
    const ahead = buildHeadToHeadViewModelV2(frameFixture(), live, { target: "ahead", showSectors: true });
    expect(ahead.status).toBe("ready");
    expect(ahead.player?.name).toBe("TOYOTA GAZOO");
    expect(ahead.opponent?.name).toBe("CADILLAC RACING");
    const behind = buildHeadToHeadViewModelV2(frameFixture(), live, { target: "behind", showSectors: true });
    expect(behind.opponent?.name).toBe("PEUGEOT");
  });

  it("reporta missing sin fabricar rival cuando no hay vecino", () => {
    const f = frameFixture({ standings: [{ id: "4", position: 1, classId: "HYPERCAR", classPosition: 1, driver: "TOYOTA GAZOO", number: "8", gap: { q: "fresh", v: 0 }, lastLap: { q: "fresh", v: 92 } }] });
    const model = buildHeadToHeadViewModelV2(f, live, { target: "ahead", showSectors: true });
    expect(model.status).toBe("missing");
    expect(model.opponent).toBeUndefined();
  });

  it("usa target y showSectors del content", () => {
    const model = buildHeadToHeadViewModelV2(frameFixture(), live, { target: "behind", showSectors: false });
    expect(model.target).toBe("behind");
    expect(model.showSectors).toBe(false);
    expect(model.sectorComparisons).toEqual([]);
  });

  it("propaga estados no live como unavailable", () => {
    expect(buildHeadToHeadViewModelV2(frameFixture(), { state: "error" }, { target: "ahead", showSectors: true }).status).toBe("error");
    expect(buildHeadToHeadViewModelV2(frameFixture(), { state: "stopped" }, { target: "ahead", showSectors: true }).status).toBe("disconnected");
  });

  it("equivalencia sintetica con v1: mismo player y vecino sobre mock", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const v1 = buildHeadToHeadViewModel(snapshot, { target: "ahead", showSectors: true });
    const v2 = buildHeadToHeadViewModelV2(frameFixture(), live, { target: "ahead", showSectors: true });
    expect(v2.player?.name).toBe(v1.player?.name);
    expect(v2.opponent?.place).toBe(v1.opponent?.place);
  });
});
