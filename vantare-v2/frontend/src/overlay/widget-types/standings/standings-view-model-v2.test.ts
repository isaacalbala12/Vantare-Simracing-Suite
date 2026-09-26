import { decodeOverlayUpdateV2 } from "../../../telemetry-transport/overlay-frame-v2-store";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayStandingRowV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import { standingsDefinition } from "./standings-definition";
import { buildStandingsViewModelV2, standingsDisplayedValues } from "./standings-view-model-v2";
import { formatStandingsLapDifference, formatStandingsSecondsDifference } from "./standings-formatting";

const content = standingsDefinition.parseContent({ classScope: "all-classes", classificationMode: "normal", rowCount: 20 });

function frameForPhase(phase: "practice" | "qualifying" | "race"): OverlayFrameV2 {
  const frame = structuredClone(decodeOverlayUpdateV2(JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json",
  ), "utf8")))) as { frame: OverlayFrameV2 };
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

function fullGoldenFrame(): OverlayFrameV2 {
  return (structuredClone(decodeOverlayUpdateV2(JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json",
  ), "utf8")))) as { frame: OverlayFrameV2 }).frame;
}

describe("buildStandingsViewModelV2 session columns", () => {
  it("projects fresh race-gap authority only for non-lapped cars known to be on track", () => {
    const base = frameForPhase("race");
    const first = { ...base.standings[0]!, pit: "track", gapLaps: 0, gap: { q: "fresh" as const } };
    const project = (patch: Partial<OverlayStandingRowV2> = {}, phase = base.session.phase, source: OverlaySourceStatusV2 = { state: "live" }) => buildStandingsViewModelV2({ ...base, session: { ...base.session, phase }, standings: [{ ...first, ...patch }] }, source, content).rows[0]!.battleGapSeconds;
    expect(project()).toBe(0); // Go omitempty retains fresh zero through quality.
    expect(project({ gap: { q: "fresh", v: 0.6 } })).toBe(0.6);
    for (const q of ["stale", "invalid", "missing"] as const) expect(project({ gap: { q, v: 0.6 } })).toBeUndefined();
    for (const v of [-1, Infinity, NaN]) expect(project({ gap: { q: "fresh", v } })).toBeUndefined();
    for (const pit of ["pit", "unknown", undefined]) expect(project({ pit })).toBeUndefined();
    expect(project({ gapLaps: 1 })).toBeUndefined();
    expect(project({}, { q: "fresh", v: "practice" })).toBeUndefined();
    expect(project({}, { q: "stale", v: "race" })).toBeUndefined();
    expect(project({}, base.session.phase, { state: "stale" })).toBeUndefined();
  });
  it("keeps record authority outside the visible window and rejects old lap samples", () => {
    const frame = frameForPhase("race");
    frame.standings[1]!.bestLap = { q: "fresh", v: 239 };
    const limited = { ...content, rowCount: 1 };
    const value = buildStandingsViewModelV2(frame, { state: "live" }, limited);
    expect(value.rows).toHaveLength(1);
    expect(value.sessionBest).toEqual({ rowId: frame.standings[1]!.id, seconds: 239 });
    expect(value.rows[0]!.bestLapSeconds).toBe(240);
    frame.standings[0]!.bestLap = { q: "stale", v: 238 };
    const old = buildStandingsViewModelV2(frame, { state: "live" }, limited);
    expect(old.rows[0]!.bestLapSeconds).toBeUndefined();
    expect(old.sessionBest?.seconds).toBe(239);
  });

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
    { phase: "practice" as const, gap: "+2.00s" },
    { phase: "qualifying" as const, gap: "+2.00s" },
    { phase: "race" as const, gap: "+145.60s" },
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

  it("keeps one- and two-digit seconds readable and spells lap gaps", () => {
    const frame = frameForPhase("race");
    const [leader, oneDigit] = frame.standings;
    const twoDigits = oneDigit;
    const model = buildStandingsViewModelV2({
      ...frame,
      standings: [
        { ...leader!, id: "leader", position: 1, gap: { q: "fresh", v: 0 }, gapLaps: undefined },
        { ...oneDigit!, id: "one-digit", position: 2, gap: { q: "fresh", v: 0.8 }, gapLaps: undefined },
        { ...twoDigits!, id: "two-digits", position: 3, gap: { q: "fresh", v: 11.3 }, gapLaps: undefined },
        { ...twoDigits!, id: "one-lap", position: 4, gap: { q: "fresh", v: 99 }, gapLaps: 1 },
        { ...twoDigits!, id: "two-laps", position: 5, gap: { q: "fresh", v: 99 }, gapLaps: 2 },
      ],
    }, { state: "live" }, content);

    expect(model.rows.map((row) => row.gapText)).toEqual([
      "Leader", "+0.80s", "+11.30s", "+1 vuelta", "+2 vueltas",
    ]);
  });

  it("preserves the sign for timing and lap differences", () => {
    expect(formatStandingsSecondsDifference(-0.8)).toBe("-0.80s");
    expect(formatStandingsLapDifference(-1)).toBe("-1 vuelta");
    expect(formatStandingsLapDifference(-2)).toBe("-2 vueltas");
  });

  it.each([
    { mode: "initial" as const, expected: "M. Costa" },
    { mode: "surname" as const, expected: "Costa" },
    { mode: "full" as const, expected: "María Costa" },
  ])("formats the driver-name column as $expected in $mode mode", ({ mode, expected }) => {
    const frame = frameForPhase("race");
    const named = {
      ...frame,
      standings: frame.standings.map((row, index) => index === 0 ? { ...row, driver: "María Costa" } : row),
    };
    const formatted = {
      ...content,
      columns: content.columns.map((column) => column.metricId === "driverName"
        ? { ...column, format: { ...column.format, mode } }
        : column),
    };
    const model = buildStandingsViewModelV2(named, { state: "live" }, formatted);

    expect(model.rows[0]).toMatchObject({ driverName: "María Costa", configuredDriverName: expected });
    expect(standingsDisplayedValues(model).rows).toContain(expected);
  });

  it("keeps the raw driver name in displayed values when the column format is unknown", () => {
    const frame = frameForPhase("race");
    const named = {
      ...frame,
      standings: frame.standings.map((row, index) => index === 0 ? { ...row, driver: "María Costa" } : row),
    };
    const formatted = {
      ...content,
      columns: content.columns.map((column) => column.metricId === "driverName"
        ? { ...column, format: { ...column.format, mode: "bogus" } }
        : column),
    };
    const model = buildStandingsViewModelV2(named, { state: "live" }, formatted);
    expect(model.rows[0]).toMatchObject({ driverName: "María Costa", configuredDriverName: "María Costa" });
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
    expect(model.rows.map((row) => row.gapText)).toEqual(["+1.00s", "+3.00s"]);
  });

  it("separates normal global order from explicit multiclass presentation", () => {
    const frame = fullGoldenFrame();
    const normal = buildStandingsViewModelV2(
      frame,
      { state: "live" },
      standingsDefinition.parseContent({ classScope: "all-classes", classificationMode: "normal", rowCount: 20 }),
    );
    const multiclass = buildStandingsViewModelV2(
      frame,
      { state: "live" },
      standingsDefinition.parseContent({ classScope: "all-classes", classificationMode: "multiclass", rowCount: 20 }),
    );

    expect(normal.classificationMode).toBe("normal");
    expect(normal.rows.slice(0, 7).map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(multiclass.classificationMode).toBe("multiclass");
    expect(multiclass.rows.slice(0, 7).map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(multiclass.rows.slice(0, 3).map((row) => row.classPosition)).toEqual([1, 1, 1]);
  });

  it("applies the podium-plus-player window after normal global projection", () => {
    const frame = fullGoldenFrame();
    const player = frame.standings.find((row) => row.position === 9);
    if (!player) throw new Error("golden frame missing position 9");
    const model = buildStandingsViewModelV2(
      { ...frame, player: { ...frame.player, id: player.id } },
      { state: "live" },
      standingsDefinition.parseContent({ classScope: "all-classes", classificationMode: "normal", rowCount: 12 }),
      { mode: "podium-around-player", around: 4 },
    );

    expect(model.rows.map((row) => row.position)).toEqual([1, 2, 3, 7, 8, 9, 10, 11]);
    expect(model.rows.find((row) => row.isPlayer)?.position).toBe(9);
  });
});
