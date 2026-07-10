import { describe, expect, it } from "vitest";
import { relativeDefinition } from "./relative-definition";

describe("relativeDefinition", () => {
  it("registers advanced tier capabilities", () => {
    expect(relativeDefinition.type).toBe("relative");
    expect(relativeDefinition.capabilities.requiredFeature).toBe("overlays.advanced");
    expect(relativeDefinition.capabilities.defaultSize).toEqual({ width: 430, height: 300 });
    expect(relativeDefinition.capabilities.supportsAspectUnlock).toBe(true);
  });

  it("creates a default widget with compact filters", () => {
    const widget = relativeDefinition.createDefault("relative-1");
    expect(widget.type).toBe("relative");
    expect(widget.behavior.updateHz).toBe(15);
    expect(widget.content).toMatchObject({
      rangeAhead: 3,
      rangeBehind: 3,
      rowHeightMode: "compact",
    });
  });

  it("exposes a custom content inspector", () => {
    expect(relativeDefinition.inspector.CustomContentInspector).toBeTruthy();
  });
});