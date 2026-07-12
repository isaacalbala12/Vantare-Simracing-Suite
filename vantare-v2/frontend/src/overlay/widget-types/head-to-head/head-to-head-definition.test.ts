import { describe, expect, it } from "vitest";
import { headToHeadDefinition } from "./head-to-head-definition";
describe("headToHeadDefinition", () => { it("creates a 10Hz head-to-head widget", () => { const widget = headToHeadDefinition.createDefault("h2h-1"); expect(widget.type).toBe("head-to-head"); expect(widget.behavior.updateHz).toBe(10); expect(widget.content).toEqual({ target: "ahead", showSectors: true }); }); });
