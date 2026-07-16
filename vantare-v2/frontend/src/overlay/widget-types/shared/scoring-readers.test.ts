import { describe, expect, it } from "vitest";
import {
  readScoringClass,
  readScoringBoolean,
  readScoringGap,
  readScoringLaps,
  readScoringName,
  readScoringNumber,
  readScoringPenalties,
  readScoringPlace,
  readScoringPit,
  readScoringString,
  readScoringTeam,
  readScoringTyre,
} from "./scoring-readers";

describe("scoring-readers", () => {
  const record = {
    driverName: "Alex",
    position: 3,
    active: true,
    gap: Number.NaN,
    interval: Number.POSITIVE_INFINITY,
    missing: null,
    nested: { value: 1 },
  } as Record<string, unknown>;

  it("reads strings without throwing", () => {
    expect(readScoringString(record, "driverName")).toBe("Alex");
    expect(readScoringString(record, "missing")).toBeUndefined();
    expect(readScoringString(record, "position")).toBeUndefined();
  });

  it("reads finite numbers and rejects NaN/Infinity", () => {
    expect(readScoringNumber(record, "position")).toBe(3);
    expect(readScoringNumber(record, "gap")).toBeUndefined();
    expect(readScoringNumber(record, "interval")).toBeUndefined();
    expect(readScoringNumber(record, "missing")).toBeUndefined();
    expect(readScoringNumber(record, "nested")).toBeUndefined();
  });

  it("reads booleans without throwing", () => {
    expect(readScoringBoolean(record, "active")).toBe(true);
    expect(readScoringBoolean(record, "driverName")).toBeUndefined();
    expect(readScoringBoolean(record, "missing")).toBeUndefined();
  });

  it("reads normalized scoring aliases for live widgets", () => {
    const scoring = {
      name: "Driver",
      team: "Team",
      class: "HYPERCAR",
      position: 4,
      laps: 12,
      gapSeconds: 1.25,
      pitting: true,
      tyreCompound: "S",
      penaltyCount: 2,
    } as Record<string, unknown>;
    expect(readScoringName(scoring)).toBe("Driver");
    expect(readScoringTeam(scoring)).toBe("Team");
    expect(readScoringClass(scoring)).toBe("HYPERCAR");
    expect(readScoringPlace(scoring)).toBe(4);
    expect(readScoringLaps(scoring)).toBe(12);
    expect(readScoringGap(scoring)).toBe(1.25);
    expect(readScoringPit(scoring)).toBe(true);
    expect(readScoringTyre(scoring)).toBe("S");
    expect(readScoringPenalties(scoring)).toBe(2);
  });
});
