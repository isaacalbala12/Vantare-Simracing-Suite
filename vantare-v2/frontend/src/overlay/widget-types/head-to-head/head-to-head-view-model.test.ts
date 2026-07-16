import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildHeadToHeadViewModel } from "./head-to-head-view-model";

describe("buildHeadToHeadViewModel", () => {
  it("selects the immediate previous rival", () => {
    const model = buildHeadToHeadViewModel(buildMockTelemetry({ session: "race", location: "track" }), { target: "ahead", showSectors: true });
    expect(model.status).toBe("ready");
    expect(model.player?.name).toBe("TOYOTA GAZOO");
    expect(model.opponent?.place).toBe(3);
    expect(model.opponent?.name).toBe("FERRARI AF");
  });

  it("reports a missing rival without fabricating a row", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const model = buildHeadToHeadViewModel({ ...snapshot, scoring: [snapshot.scoring[0]] }, { target: "ahead", showSectors: true });
    expect(model.status).toBe("missing");
    expect(model.opponent).toBeUndefined();
  });

  it("uses only the first four string sector comparisons supplied by telemetry", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const scoring = snapshot.scoring.map((row) => row.isPlayer
      ? { ...row, sectorComparisons: ["g", "g", "r", "r", "ignored", 1] }
      : row);
    const model = buildHeadToHeadViewModel({ ...snapshot, scoring }, { target: "ahead", showSectors: true });
    expect(model.sectorComparisons).toEqual(["g", "g", "r", "r"]);
  });
});
