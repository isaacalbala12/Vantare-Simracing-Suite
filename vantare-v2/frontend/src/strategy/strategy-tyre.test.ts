import { describe, expect, it } from "vitest";
import {
  assertPlannable,
  conditionMidpoint,
  defaultTyreCondition,
  formatCondition,
  isConditionExact,
  parseStrategyTyre,
  type StrategyTyre,
} from "./strategy-tyre";

function freeTyre(overrides: Partial<StrategyTyre> = {}): StrategyTyre {
  return {
    id: "S-05",
    compound: "soft",
    origin: "event_allocation",
    condition: defaultTyreCondition("event_allocation"),
    state: "free",
    stints: 0,
    ...overrides,
  };
}

describe("strategy tyre model", () => {
  it("carries the documented product ranges rather than an invented figure", () => {
    expect(defaultTyreCondition("event_allocation")).toMatchObject({
      minimumRemainingPercent: 100,
      maximumRemainingPercent: 100,
      provenance: { kind: "observed" },
      confidence: { level: "high" },
    });
    // A qualifying tyre is a range, and it says so.
    const qualifying = defaultTyreCondition("qualifying");
    expect(isConditionExact(qualifying)).toBe(false);
    expect(formatCondition(qualifying)).toBe("80–90 %");
    expect(conditionMidpoint(qualifying)).toBe(85);
    expect(formatCondition(defaultTyreCondition("event_allocation"))).toBe("100 %");
  });

  it("refuses an exact percentage that no evidence supports", () => {
    expect(() => parseStrategyTyre(freeTyre({
      condition: {
        minimumRemainingPercent: 78,
        maximumRemainingPercent: 78,
        provenance: { kind: "range", sourceId: "guess" },
        confidence: { level: "low", basis: "guess" },
      },
    }))).toThrowError(expect.objectContaining({ code: "invalid_condition" }));
  });

  it("refuses a range that claims measured evidence", () => {
    expect(() => parseStrategyTyre(freeTyre({
      condition: {
        minimumRemainingPercent: 40,
        maximumRemainingPercent: 70,
        provenance: { kind: "observed", sourceId: "sensor" },
        confidence: { level: "high", basis: "sensor" },
      },
    }))).toThrowError(expect.objectContaining({ code: "invalid_condition" }));
  });

  it("enforces the state invariants the Go domain declares", () => {
    expect(() => parseStrategyTyre(freeTyre({ lockedCorner: "front_left" })))
      .toThrowError(expect.objectContaining({ code: "invalid_state" }));
    expect(() => parseStrategyTyre(freeTyre({ state: "used", stints: 0 })))
      .toThrowError(expect.objectContaining({ code: "invalid_state" }));
    expect(() => parseStrategyTyre(freeTyre({ state: "discarded", mountedCorner: "rear_left" })))
      .toThrowError(expect.objectContaining({ code: "invalid_state" }));
    expect(parseStrategyTyre(freeTyre({
      state: "used",
      stints: 2,
      lockedCorner: "rear_right",
      origin: "qualifying",
      condition: defaultTyreCondition("qualifying"),
    })).lockedCorner).toBe("rear_right");
  });

  it("lets an unused tyre be planned anywhere and pins one that has run", () => {
    expect(() => assertPlannable(freeTyre(), "rear_right")).not.toThrow();
    const used = freeTyre({
      state: "used", stints: 1, lockedCorner: "front_left",
      origin: "qualifying", condition: defaultTyreCondition("qualifying"),
    });
    expect(() => assertPlannable(used, "front_left")).not.toThrow();
    expect(() => assertPlannable(used, "front_right"))
      .toThrowError(expect.objectContaining({ code: "corner_locked" }));
    expect(() => assertPlannable(freeTyre({ state: "discarded" }), "front_left"))
      .toThrowError(expect.objectContaining({ code: "tyre_discarded" }));
  });

  it("migrates a document saved before the models were unified", () => {
    const migrated = parseStrategyTyre({ id: "M-01", compound: "medium", remainingPercent: 78 });
    expect(migrated.state).toBe("free");
    expect(migrated.stints).toBe(0);
    // The stored figure is preserved, but labelled as what it is.
    expect(migrated.condition).toMatchObject({
      minimumRemainingPercent: 78,
      maximumRemainingPercent: 78,
      provenance: { kind: "manual", sourceId: "legacy-editor-document" },
      confidence: { level: "low" },
    });

    const locked = parseStrategyTyre({
      id: "H-03", compound: "hard", remainingPercent: 77, lockedCorner: "rear_left",
    });
    expect(locked.state).toBe("used");
    expect(locked.stints).toBe(1);
    expect(locked.lockedCorner).toBe("rear_left");
  });

  it("does not migrate a document that already carries a condition", () => {
    const tyre = parseStrategyTyre(freeTyre());
    expect(tyre.condition.provenance.sourceId).toBe("event-allocation");
  });
});
