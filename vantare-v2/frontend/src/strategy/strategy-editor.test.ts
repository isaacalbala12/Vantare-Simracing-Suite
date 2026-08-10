import { describe, expect, it } from "vitest";

import {
  appendStint,
  assignTyre,
  clearTyreAssignment,
  createDefaultStrategyEditorDocument,
  deleteStint,
  duplicateStint,
  insertStint,
  moveStint,
  parseStrategyEditorDocument,
  stintLapRange,
  StrategyEditorError,
  tyreUseCount,
} from "./strategy-editor";

describe("Strategy editor document", () => {
  it("creates, inserts, duplicates, deletes and reorders stints immutably", () => {
    const original = createDefaultStrategyEditorDocument();
    const appended = appendStint(original);
    expect(appended.stints.map((item) => item.id)).toEqual([
      "stint-1", "stint-2", "stint-3", "stint-4", "stint-5",
    ]);
    const inserted = insertStint(appended, 1);
    expect(inserted.stints[1].id).toBe("stint-6");
    const duplicated = duplicateStint(inserted, "stint-2");
    expect(duplicated.stints[3]).toMatchObject({ id: "stint-7", lapCount: 22 });
    const moved = moveStint(duplicated, "stint-7", 0);
    expect(moved.stints[0].id).toBe("stint-7");
    const removed = deleteStint(moved, "stint-7");
    expect(removed.stints.some((item) => item.id === "stint-7")).toBe(false);
    expect(original.stints).toHaveLength(4);
    expect(Object.isFrozen(removed)).toBe(true);
  });

  it("plans a fresh tyre on any corner because planning is not running", () => {
    const original = createDefaultStrategyEditorDocument();
    const assigned = assignTyre(original, "stint-1", "front_left", "S-05");
    expect(assigned.stints[0].assignments.front_left).toBe("S-05");
    // A tyre that has never run stays unlocked: only recorded use fixes a corner.
    expect(assigned.tyres.find((item) => item.id === "S-05")?.lockedCorner).toBeUndefined();

    const moved = assignTyre(assigned, "stint-2", "front_right", "S-05");
    expect(moved.stints[1].assignments.front_right).toBe("S-05");

    const cleared = clearTyreAssignment(moved, "stint-1", "front_left");
    expect(cleared.stints[0].assignments.front_left).toBeNull();
  });

  it("keeps a tyre that has already run on its locked corner", () => {
    const original = createDefaultStrategyEditorDocument();
    const used = original.tyres.find((item) => item.id === "M-01");
    expect(used?.state).toBe("used");
    expect(used?.lockedCorner).toBe("front_left");

    expect(() => assignTyre(original, "stint-2", "rear_right", "M-01"))
      .toThrowError(expect.objectContaining({ code: "corner_locked" }));
    expect(assignTyre(original, "stint-2", "front_left", "M-01").stints[1].assignments.front_left)
      .toBe("M-01");
  });

  it("rejects one tyre in two corners of the same stint", () => {
    const original = createDefaultStrategyEditorDocument();
    // M-01 is locked to front left, so the corner rule answers first — that is
    // the physical reason, not a planning clash.
    expect(() => assignTyre(original, "stint-1", "front_right", "M-01"))
      .toThrowError(expect.objectContaining({ code: "corner_locked" }));

    const assigned = assignTyre(original, "stint-1", "front_left", "S-05");
    expect(() => assignTyre(assigned, "stint-1", "rear_left", "S-05"))
      .toThrowError(expect.objectContaining({ code: "tyre_already_assigned" }));
  });

  it("keeps lap ranges and tyre use counts derived from the document", () => {
    const document = createDefaultStrategyEditorDocument();
    expect(stintLapRange(document, 0)).toEqual({ start: 1, end: 17 });
    expect(stintLapRange(document, 3)).toEqual({ start: 59, end: 78 });
    expect(tyreUseCount(document, "M-01")).toBe(4);
    expect(tyreUseCount(document, "S-05")).toBe(0);
  });

  it("rejects deletion of the final stint", () => {
    let document = createDefaultStrategyEditorDocument();
    for (const id of ["stint-4", "stint-3", "stint-2"]) document = deleteStint(document, id);
    expect(() => deleteStint(document, "stint-1"))
      .toThrowError(expect.objectContaining({ code: "last_stint" }));
  });

  it("rejects corrupt persisted assignments instead of repairing them silently", () => {
    const document = structuredClone(createDefaultStrategyEditorDocument());
    document.stints[0].assignments.front_right = "M-01";
    expect(() => parseStrategyEditorDocument(document)).toThrow(StrategyEditorError);
  });
});
