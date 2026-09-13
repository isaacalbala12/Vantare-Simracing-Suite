import { describe, expect, it } from "vitest";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { deriveDeltaEvents } from "./delta-motion";

function model(partial: Partial<DeltaViewModel> = {}): DeltaViewModel {
  return {
    type: "delta",
    status: "ready",
    tone: "neutral",
    deltaText: "0.000",
    lastLapText: "1:38.451",
    bestLapText: "1:38.031",
    progress: 0,
    ...partial,
  };
}

describe("delta motion events", () => {
  it("reports nothing without a previous model", () => {
    expect(deriveDeltaEvents(null, model({ tone: "gaining" }))).toEqual([]);
  });

  it("reports crossing zero in both directions", () => {
    expect(deriveDeltaEvents(model({ tone: "losing" }), model({ tone: "gaining" }))).toEqual([
      { kind: "cross-zero", to: "gaining" },
    ]);
    expect(deriveDeltaEvents(model({ tone: "gaining" }), model({ tone: "losing" }))).toEqual([
      { kind: "cross-zero", to: "losing" },
    ]);
  });

  it("does not fire while the delta merely grows on the same side", () => {
    const before = model({ tone: "gaining", progress: -0.1 });
    const after = model({ tone: "gaining", progress: -0.8 });
    expect(deriveDeltaEvents(before, after)).toEqual([]);
  });

  it("treats the neutral band as no side, so hovering on zero stays quiet", () => {
    expect(deriveDeltaEvents(model({ tone: "gaining" }), model({ tone: "neutral" }))).toEqual([]);
    expect(deriveDeltaEvents(model({ tone: "neutral" }), model({ tone: "losing" }))).toEqual([]);
  });

  it("reports a new reference lap", () => {
    const events = deriveDeltaEvents(
      model({ bestLapText: "1:38.031" }),
      model({ bestLapText: "1:37.402" }),
    );
    expect(events).toEqual([{ kind: "new-best" }]);
  });

  it("ignores a reference that becomes unknown or empty", () => {
    expect(deriveDeltaEvents(model({ bestLapText: "1:38.031" }), model({ bestLapText: "—" }))).toEqual([]);
    expect(deriveDeltaEvents(model({ bestLapText: "1:38.031" }), model({ bestLapText: "" }))).toEqual([]);
  });

  it("can report both a crossing and a new best from the same step", () => {
    const events = deriveDeltaEvents(
      model({ tone: "losing", bestLapText: "1:38.031" }),
      model({ tone: "gaining", bestLapText: "1:37.402" }),
    );
    expect(events).toEqual([{ kind: "cross-zero", to: "gaining" }, { kind: "new-best" }]);
  });
});
