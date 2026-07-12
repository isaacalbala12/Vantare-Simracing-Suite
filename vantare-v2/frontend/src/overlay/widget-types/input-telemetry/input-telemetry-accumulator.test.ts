import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { readInputTelemetryHistory, recordInputTelemetrySample, resetInputTelemetryHistory } from "./input-telemetry-accumulator";

describe("input telemetry accumulator", () => {
  it("caps samples and resets when the session epoch changes", () => {
    resetInputTelemetryHistory();
    const base = buildMockTelemetry({ session: "race", location: "track" });
    for (let index = 0; index < 130; index += 1) recordInputTelemetrySample("widget-1", { ...base, capturedAt: base.capturedAt + index * 100 });
    expect(readInputTelemetryHistory("widget-1", base, 20)).toHaveLength(120);
    const next = { ...base, capturedAt: base.capturedAt + 20_000, session: { ...base.session, epoch: 2, key: "race-2" } };
    recordInputTelemetrySample("widget-1", next);
    expect(readInputTelemetryHistory("widget-1", next, 20)).toHaveLength(1);
  });
});
