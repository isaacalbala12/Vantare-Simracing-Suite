import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2 } from "../../../generated/telemetry";
import { standingsDefinition } from "./standings-definition";
import { buildStandingsViewModelV2 } from "./standings-view-model-v2";

const content = standingsDefinition.parseContent({ classScope: "all-classes", rowCount: 20 });

function frameForPhase(phase: "practice" | "qualifying" | "race"): OverlayFrameV2 {
  const frame = JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json",
  ), "utf8")) as { frame: OverlayFrameV2 };
  return {
    ...frame.frame,
    session: { ...frame.frame.session, phase: { q: "fresh", v: phase } },
    standings: frame.frame.standings.slice(0, 2).map((row, index) => ({
      ...row,
      gap: { q: "fresh", v: index === 0 ? 0 : 145.6 },
      pit: index === 1 ? "pit" : "track",
      bestLap: { q: "fresh", v: 240 + index * 2 },
    })) as OverlayFrameV2["standings"],
  };
}

describe("buildStandingsViewModelV2 session columns", () => {
  it("projects session information without confusing fuel range with race laps", () => {
    const frame = frameForPhase("race");
    const model = buildStandingsViewModelV2({ ...frame,
      session: { ...frame.session, flag: { q: "fresh", v: "yellow" }, maxLaps: { q: "fresh", v: 42 } },
      weather: { ...frame.weather, trackC: { q: "fresh", v: 32.4 }, ambientC: { q: "fresh", v: 21 } },
      fuel: { ...frame.fuel, estimatedLaps: { q: "fresh", v: 5 }, sessionLaps: { q: "fresh", v: 18 } },
    }, { state: "live" }, content);
    expect(model.flag).toBe("yellow");
    expect(model.sessionInfo).toMatchObject({
      trackTemperature: { text: "32.4°C" }, airTemperature: { text: "21°C" },
      totalLaps: { text: "42" }, estimatedLaps: { text: "≈18" },
    });
  });

  it.each(["missing", "invalid", "stale"] as const)("does not present a %s flag as current", (q) => {
    const frame = frameForPhase("race");
    expect(buildStandingsViewModelV2({ ...frame, session: { ...frame.session, flag: { q, v: "green" } } }, { state: "live" }, content).flag).toBe("unknown");
  });

  it("neutralizes a retained flag when the entire source is stale", () => {
    const frame = frameForPhase("race");
    expect(buildStandingsViewModelV2({ ...frame, session: { ...frame.session, flag: { q: "fresh", v: "red" } } }, { state: "stale" }, content).flag).toBe("unknown");
  });

  it("preserves unknown data, rejects lap sentinels and identifies stale values", () => {
    const frame = frameForPhase("race");
    const model = buildStandingsViewModelV2({ ...frame,
      session: { ...frame.session, flag: { q: "fresh", v: "not-a-flag" }, maxLaps: { q: "fresh", v: 2147483647 } },
      weather: { ...frame.weather, trackC: { q: "missing", v: 99 }, ambientC: { q: "stale", v: 0 } },
      fuel: { ...frame.fuel, estimatedLaps: { q: "fresh", v: 5 }, sessionLaps: { q: "missing" } },
    }, { state: "live" }, content);
    expect(model.flag).toBe("unknown");
    expect(model.sessionInfo).toMatchObject({
      trackTemperature: { text: "—" }, airTemperature: { text: "0°C", stale: true },
      totalLaps: { text: "—" }, estimatedLaps: { text: "—" },
    });
  });

  it("does not invent a race estimate during practice", () => {
    const frame = frameForPhase("practice");
    const model = buildStandingsViewModelV2({ ...frame, fuel: { ...frame.fuel, sessionLaps: { q: "fresh", v: 18 } } }, { state: "live" }, content);
    expect(model.sessionInfo?.estimatedLaps.text).toBe("—");
  });

  it("formats canonical Celsius values in the preferred temperature unit", () => {
    const frame = frameForPhase("race");
    const model = buildStandingsViewModelV2({ ...frame, units: { ...frame.units, temperature: "fahrenheit" }, weather: { ...frame.weather, trackC: { q: "fresh", v: 20 } } }, { state: "live" }, content);
    expect(model.sessionInfo?.trackTemperature.text).toBe("68°F");
  });

  it.each([
    { phase: "practice" as const, gap: "+2.000s" },
    { phase: "qualifying" as const, gap: "+2.000s" },
    { phase: "race" as const, gap: "+145.600s" },
  ])("maps coherent best-lap and gap fields in $phase", ({ phase, gap }) => {
    const model = buildStandingsViewModelV2(frameForPhase(phase), { state: "live" }, content);

    expect(model.rows[0]).toMatchObject({ bestLapText: "4:00.000", gapText: "Leader" });
    expect(model.rows[1]).toMatchObject({
      bestLapText: "4:02.000",
      gapText: gap,
      pitText: "PIT",
    });
    expect(model.rows[1]?.gapText).not.toBe(model.rows[1]?.pitText);
  });

  it("uses the session/class scope best lap even when its row is below rowCount", () => {
    const frame = frameForPhase("practice");
    const outsideLimit = {
      ...frame.standings[1]!,
      id: "best-outside-limit",
      position: 3,
      bestLap: { q: "fresh" as const, v: 239 },
    };
    const model = buildStandingsViewModelV2(
      { ...frame, standings: [...frame.standings, outsideLimit] },
      { state: "live" },
      { ...content, rowCount: 2 },
    );

    expect(model.rows).toHaveLength(2);
    expect(model.rows.map((row) => row.gapText)).toEqual(["+1.000s", "+3.000s"]);
  });
});
