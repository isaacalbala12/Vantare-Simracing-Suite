import { describe, expect, it } from "vitest";
import type {
  RelativeRowViewModel,
  RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";
import {
  deriveRelativeEvents,
  deriveThreatRows,
} from "./relative-motion";

function row(partial: Partial<RelativeRowViewModel> & { id: string }): RelativeRowViewModel {
  return {
    position: 10,
    vehicleClass: "GT3",
    driverNumber: "51",
    driverName: "Driver",
    gapText: "+1.0",
    bestLapText: "1:38.0",
    lastLapText: "1:38.4",
    isPlayer: false,
    side: "ahead",
    tone: "ahead",
    gapSeconds: 1,
    ...partial,
  };
}

function model(rows: RelativeRowViewModel[]): RelativeViewModel {
  return { type: "relative", status: "ready", columns: [], rowHeightMode: "auto", rows };
}

const player = row({ id: "me", isPlayer: true, side: "player", tone: "player", gapSeconds: 0 });

describe("relative motion events", () => {
  it("reports nothing without a previous model", () => {
    expect(deriveRelativeEvents(null, model([player]))).toEqual([]);
  });

  it("reports a crossing when a rival changes side of the player", () => {
    const before = model([row({ id: "a", side: "ahead", tone: "ahead", gapSeconds: 0.4 }), player]);
    const after = model([player, row({ id: "a", side: "behind", tone: "behind", gapSeconds: -0.3 })]);
    expect(deriveRelativeEvents(before, after)).toEqual([
      { kind: "cross", rowId: "a", to: "behind" },
    ]);
  });

  it("reports a physical crossing while temporal presentation stays neutral", () => {
    const before = model([row({ id: "a", side: "ahead", tone: "neutral", gapSeconds: null }), player]);
    const after = model([player, row({ id: "a", side: "behind", tone: "neutral", gapSeconds: null })]);
    expect(deriveRelativeEvents(before, after)).toEqual([
      { kind: "cross", rowId: "a", to: "behind" },
    ]);
  });

  it("ignores movement that never changes side", () => {
    const before = model([row({ id: "a", tone: "ahead", gapSeconds: 2.4 }), player]);
    const after = model([row({ id: "a", tone: "ahead", gapSeconds: 0.6 }), player]);
    expect(deriveRelativeEvents(before, after)).toEqual([]);
  });

  it("does not fire on a row whose side is unknown", () => {
    const before = model([row({ id: "a", tone: "neutral", gapSeconds: null }), player]);
    const after = model([row({ id: "a", tone: "behind", gapSeconds: -0.3 }), player]);
    expect(deriveRelativeEvents(before, after)).toEqual([]);
  });

  it("reports rows entering and leaving the visible window", () => {
    const before = model([player, row({ id: "a" })]);
    const after = model([player, row({ id: "b" })]);
    const events = deriveRelativeEvents(before, after);
    expect(events).toContainEqual({ kind: "enter", rowId: "b" });
    expect(events).toContainEqual({ kind: "exit", rowId: "a" });
  });

  it("never reports the player as entering, leaving or crossing", () => {
    const before = model([row({ id: "me", isPlayer: true, tone: "player", gapSeconds: 0 })]);
    const after = model([row({ id: "me", isPlayer: true, tone: "ahead", gapSeconds: 1 })]);
    expect(deriveRelativeEvents(before, after)).toEqual([]);
  });
});

describe("relative threats", () => {
  it("marks rivals within a second either side, and never the player", () => {
    const threats = deriveThreatRows(
      model([
        row({ id: "close-ahead", gapSeconds: 0.8 }),
        row({ id: "far", gapSeconds: 4.2 }),
        player,
        row({ id: "close-behind", gapSeconds: -0.9 }),
      ]),
    );
    expect([...threats].sort()).toEqual(["close-ahead", "close-behind"]);
  });

  it("ignores rows with an unknown gap", () => {
    expect(deriveThreatRows(model([row({ id: "a", gapSeconds: null }), player])).size).toBe(0);
  });
});
