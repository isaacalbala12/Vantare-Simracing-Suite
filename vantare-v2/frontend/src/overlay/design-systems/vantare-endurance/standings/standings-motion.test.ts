import { describe, expect, it } from "vitest";
import type {
  StandingsRowViewModel,
  StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import {
  deriveBattlePairs,
  deriveFlipOffsets,
  derivePositionDeltas,
  deriveStandingsEvents,
  classPositionsById,
} from "./standings-motion";

function row(partial: Partial<StandingsRowViewModel> & { id: string }): StandingsRowViewModel {
  return {
    position: 1,
    driverNumber: "0",
    driverName: "Driver",
    vehicleClass: "GT3",
    teamCode: "",
    teamBrandColor: "",
    gapText: "—",
    intervalText: "—",
    currentLapText: "",
    lastLapText: "—",
    bestLapText: "—",
    pitText: "",
    tireCompound: "M",
    isPlayer: false,
    isLeader: false,
    ...partial,
  };
}

function model(rows: StandingsRowViewModel[], status: StandingsViewModel["status"] = "ready"): StandingsViewModel {
  return {
    type: "standings",
    status,
    activeClass: "GT3",
    sessionLabel: "RACE",
    remainingText: "01:00:00",
    columns: [],
    rows,
  };
}

const gridA = () =>
  model([
    row({ id: "a", position: 1, gapText: "—", isPlayer: false }),
    row({ id: "b", position: 2, gapText: "+2.0s" }),
    row({ id: "c", position: 3, gapText: "+4.0s", isPlayer: true }),
  ]);

describe("standings-motion", () => {
  it("derives a confirmed overtake with gainer and loser", () => {
    const prev = gridA();
    const next = model([
      row({ id: "a", position: 1, gapText: "—" }),
      row({ id: "c", position: 2, gapText: "+3.9s", isPlayer: true }),
      row({ id: "b", position: 3, gapText: "+4.1s" }),
    ]);
    const events = deriveStandingsEvents(prev, next);
    expect(events).toContainEqual({
      kind: "overtake",
      gainerId: "c",
      loserId: "b",
      vehicleClass: "GT3",
    });
  });

  it("does not fire overtakes when a car simply disappears from the field", () => {
    const prev = gridA();
    const next = model([
      row({ id: "a", position: 1, gapText: "—" }),
      row({ id: "c", position: 2, gapText: "+3.9s", isPlayer: true }),
    ]);
    const events = deriveStandingsEvents(prev, next).filter((event) => event.kind === "overtake");
    expect(events).toHaveLength(0);
  });

  it("returns no events without a previous ready model", () => {
    expect(deriveStandingsEvents(null, gridA())).toHaveLength(0);
    expect(deriveStandingsEvents(model([], "stale"), gridA())).toHaveLength(0);
  });

  it("detects the session-best takeover with the previous holder", () => {
    const prev = model([
      row({ id: "a", bestLapText: "1:40.000" }),
      row({ id: "b", position: 2, bestLapText: "1:41.000" }),
    ]);
    const next = model([
      row({ id: "a", bestLapText: "1:40.000" }),
      row({ id: "b", position: 2, bestLapText: "1:39.500" }),
    ]);
    expect(deriveStandingsEvents(prev, next)).toContainEqual({
      kind: "session-best",
      rowId: "b",
      previousRowId: "a",
    });
  });

  it("detects pit-in and pit-out with tire change", () => {
    const prev = model([row({ id: "a", pitText: "", tireCompound: "M" })]);
    const inPit = model([row({ id: "a", pitText: "PIT", tireCompound: "M" })]);
    const out = model([row({ id: "a", pitText: "", tireCompound: "S" })]);
    expect(deriveStandingsEvents(prev, inPit)).toContainEqual({ kind: "pit-in", rowId: "a" });
    expect(deriveStandingsEvents(inPit, out)).toContainEqual({
      kind: "pit-out",
      rowId: "a",
      tireCompound: "S",
      tireChanged: true,
    });
  });

  it("derives battle pairs only under the threshold and never with pitted cars", () => {
    const battle = model([
      row({ id: "a", position: 1, gapText: "—" }),
      row({ id: "b", position: 2, gapText: "+0.5s" }),
      row({ id: "c", position: 3, gapText: "+4.0s" }),
    ]);
    const pairs = deriveBattlePairs(battle);
    expect(pairs).toEqual([
      { aheadId: "a", behindId: "b", vehicleClass: "GT3", intervalSeconds: 0.5 },
    ]);

    const pitted = model([
      row({ id: "a", position: 1, gapText: "—", pitText: "PIT" }),
      row({ id: "b", position: 2, gapText: "+0.5s" }),
    ]);
    expect(deriveBattlePairs(pitted)).toHaveLength(0);
  });

  it("computes FLIP offsets from in-class index changes", () => {
    const prev = gridA();
    const next = model([
      row({ id: "a", position: 1, gapText: "—" }),
      row({ id: "c", position: 2, gapText: "+3.9s", isPlayer: true }),
      row({ id: "b", position: 3, gapText: "+4.1s" }),
    ]);
    const offsets = deriveFlipOffsets(prev, next, 30);
    expect(offsets.get("c")).toBe(30);
    expect(offsets.get("b")).toBe(-30);
    expect(offsets.has("a")).toBe(false);
  });

  it("tracks net position deltas against the session baseline", () => {
    const baseline = classPositionsById(gridA());
    const next = model([
      row({ id: "c", position: 1, gapText: "—", isPlayer: true }),
      row({ id: "a", position: 2, gapText: "+1.0s" }),
      row({ id: "b", position: 3, gapText: "+2.0s" }),
    ]);
    const deltas = derivePositionDeltas(baseline, next);
    expect(deltas.get("c")).toBe(2);
    expect(deltas.get("a")).toBe(-1);
    expect(deltas.get("b")).toBe(-1);
  });
});
