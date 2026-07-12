import { describe, expect, it } from "vitest";
import { inputTelemetryDefinition } from "./input-telemetry-definition";
describe("inputTelemetryDefinition", () => { it("creates a 30Hz history widget", () => { const widget = inputTelemetryDefinition.createDefault("input-1"); expect(widget.type).toBe("input-telemetry"); expect(widget.behavior.updateHz).toBe(30); expect(widget.content).toEqual({ historySeconds: 4, showClutch: true }); }); });
