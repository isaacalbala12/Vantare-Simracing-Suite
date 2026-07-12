import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildDeltaAdvancedViewModel } from "./delta-advanced-view-model";
describe("buildDeltaAdvancedViewModel", () => { it("exposes best live and marks unavailable projections honestly", () => { const model = buildDeltaAdvancedViewModel(buildMockTelemetry({ session: "race", location: "track" }), {}); expect(model.type).toBe("delta-advanced"); expect(model.best).toBe(-0.15); expect(model.availability.best).toBe(true); expect(model.availability.sector).toBe(false); expect(model.sector).toBeUndefined(); expect(model.theoretical).toBeUndefined(); }); });
