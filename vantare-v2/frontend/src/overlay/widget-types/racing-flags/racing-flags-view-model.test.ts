import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildRacingFlagsViewModel } from "./racing-flags-view-model";

describe("buildRacingFlagsViewModel", () => {
  it("reads global and sector flags from the session", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const model = buildRacingFlagsViewModel(snapshot, { showSectorFlags: true, hideWhenGreen: false });
    expect(model).toMatchObject({ type: "racing-flags", status: "ready", globalFlag: "green", sectorFlags: ["green", "green", "green"] });
  });

  it("does not invent flags when the source is unavailable", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const model = buildRacingFlagsViewModel({ ...snapshot, session: { ...snapshot.session, globalFlag: undefined, sectorFlags: undefined } }, { showSectorFlags: true, hideWhenGreen: true });
    expect(model.globalFlag).toBeUndefined();
    expect(model.sectorFlags).toEqual([]);
    expect(model.hidden).toBe(false);
  });
});
