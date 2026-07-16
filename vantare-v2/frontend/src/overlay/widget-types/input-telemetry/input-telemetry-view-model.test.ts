import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildInputTelemetryViewModel } from "./input-telemetry-view-model";
describe("buildInputTelemetryViewModel", () => { it("exposes live inputs and an empty pure history by default", () => { const model = buildInputTelemetryViewModel(buildMockTelemetry({ session: "race", location: "track" }), { historySeconds: 4, showClutch: true }); expect(model).toMatchObject({ type: "input-telemetry", throttle: 0.78, brake: 0.12, clutch: 0, speedKph: 242, rpm: 8120, gear: 6 }); expect(model.history).toEqual([]); }); });
