import { describe, expect, it } from "vitest";
import { deltaAdvancedDefinition } from "./delta-advanced-definition";
describe("deltaAdvancedDefinition", () => { it("creates a 10Hz advanced delta widget", () => { const widget = deltaAdvancedDefinition.createDefault("delta-advanced-1"); expect(widget.type).toBe("delta-advanced"); expect(widget.behavior.updateHz).toBe(10); expect(widget.content).toEqual({ showUnavailableFields: true }); }); });
