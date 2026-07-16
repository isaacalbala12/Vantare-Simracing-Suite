import { describe, expect, it } from "vitest";
import { multiclassRelativeDefinition } from "./multiclass-relative-definition";
describe("multiclassRelativeDefinition", () => { it("creates a seven-row 10Hz relative widget", () => { const widget = multiclassRelativeDefinition.createDefault("multi-1"); expect(widget.type).toBe("multiclass-relative"); expect(widget.behavior.updateHz).toBe(10); expect(widget.content).toEqual({ rowCount: 5, classMode: "all", showClassDivider: true }); }); });
