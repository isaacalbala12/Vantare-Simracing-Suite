import { describe, expect, it } from "vitest";
import {
  readScoringBoolean,
  readScoringNumber,
  readScoringString,
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
});