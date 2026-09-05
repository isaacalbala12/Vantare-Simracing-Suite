import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import type { MulticlassRelativeContent } from "./multiclass-relative-definition";
import { buildMulticlassRelativeViewModelV2 } from "./multiclass-relative-view-model-v2";

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
      { id: "0", side: "ahead", authority: "native", classId: "HYPERCAR", name: "ALPINE", gap: { q: "fresh", v: 5.2 } },
      { id: "3", side: "ahead", authority: "native", classId: "HYPERCAR", name: "CADILLAC", gap: { q: "fresh", v: 1.1 } },
      { id: "4", side: "player", authority: "native", classId: "HYPERCAR", name: "TOYOTA", gap: { q: "fresh", v: 0 } },
      { id: "5", side: "behind", authority: "native", classId: "LMP2", name: "ORECA", gap: { q: "fresh", v: -2.3 } },
      { id: "25", side: "behind", authority: "native", classId: "LMGT3", name: "BMW GT", gap: { q: "fresh", v: -4.0 } },
    ],
    session: { flag: { q: "missing" }, maxLaps: { q: "missing" }, phase: { q: "missing" }, remaining: { q: "missing" }, track: { q: "missing" } },
    spotter: { left: { q: "missing" }, mode: "none", right: { q: "missing" } },
    standings: [
      { id: "0", position: 1, classId: "HYPERCAR", classPosition: 1, driver: "ALPINE", number: "36", gap: { q: "fresh", v: 0 }, lastLap: { q: "fresh", v: 90 } },
      { id: "3", position: 4, classId: "HYPERCAR", classPosition: 4, driver: "CADILLAC RACING", number: "2", gap: { q: "fresh", v: 1.1 }, lastLap: { q: "fresh", v: 91 } },
      { id: "4", position: 5, classId: "HYPERCAR", classPosition: 5, driver: "TOYOTA GAZOO", number: "8", gap: { q: "fresh", v: 0 }, lastLap: { q: "fresh", v: 92 } },
      { id: "5", position: 6, classId: "LMP2", classPosition: 1, driver: "ORECA", number: "94", gap: { q: "fresh", v: 2.3 }, lastLap: { q: "fresh", v: 93 } },
      { id: "25", position: 26, classId: "LMGT3", classPosition: 1, driver: "BMW LMGT3", number: "10", gap: { q: "fresh", v: 5.0 }, lastLap: { q: "fresh", v: 119 } },
    ],
    units: { fuel: "liters", pressure: "kpa", speed: "kph", temperature: "celsius" },
  };
  return { ...base, ...overrides, standings: overrides?.standings ?? base.standings, relative: overrides?.relative ?? base.relative };
}

const live: OverlaySourceStatusV2 = { state: "live" };
const content: MulticlassRelativeContent = { rowCount: 5, classMode: "all", showClassDivider: true };

describe("buildMulticlassRelativeViewModelV2", () => {
  it("construye filas desde standings+relative cuando el frame esta completo", () => {
    const model = buildMulticlassRelativeViewModelV2(frameFixture(), live, content);
    expect(model.status).toBe("ready");
    expect(model.rows.some((r) => r.isPlayer)).toBe(true);
    expect(model.rows.length).toBeLessThanOrEqual(5);
  });

  it("devuelve missing cuando no hay player en el frame", () => {
    const f = frameFixture({ player: { id: "999", brake: { q: "missing" }, clutch: { q: "missing" }, gear: { q: "missing" }, rpm: { q: "missing" }, speed: { q: "missing" }, steering: { q: "missing" }, throttle: { q: "missing" } } });
    const model = buildMulticlassRelativeViewModelV2(f, live, content);
    expect(model.status).toBe("missing");
    expect(model.rows).toEqual([]);
  });

  it("respeta classMode same y other", () => {
    const same = buildMulticlassRelativeViewModelV2(frameFixture(), live, { ...content, classMode: "same" });
    expect(same.rows.every((r) => r.classId === "HYPERCAR")).toBe(true);
    const other = buildMulticlassRelativeViewModelV2(frameFixture(), live, { ...content, classMode: "other" });
    expect(other.rows.every((r) => r.classId !== "HYPERCAR")).toBe(true);
  });

  it("devuelve disconnected/error en estados no live", () => {
    expect(buildMulticlassRelativeViewModelV2(frameFixture(), { state: "stopped" }, content).status).toBe("disconnected");
    expect(buildMulticlassRelativeViewModelV2(frameFixture(), { state: "error" }, content).status).toBe("error");
  });

});
