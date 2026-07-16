import { describe, expect, it } from "vitest";
import { pedalsDefinition } from "./pedals-definition";

describe("pedalsDefinition", () => {
  it("creates an enabled Original Pedals widget with empty content", () => {
    const widget = pedalsDefinition.createDefault("pedals-main");
    expect(widget).toMatchObject({
      id: "pedals-main",
      type: "pedals",
      behavior: { enabled: true, updateHz: 30 },
      content: {},
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    });
    expect(widget.layout).toEqual({
      x: 64,
      y: 64,
      w: 120,
      h: 160,
      zIndex: 0,
      aspectLocked: true,
    });
  });

  it("parses empty Pedals content", () => {
    expect(pedalsDefinition.parseContent({})).toEqual({});
    expect(pedalsDefinition.parseContent(undefined)).toEqual({});
  });

  it("rejects non-object content", () => {
    expect(() => pedalsDefinition.parseContent("invalid")).toThrow(/content/i);
  });

  it("declares no functional content inspector controls", () => {
    expect(pedalsDefinition.inspector.content).toEqual([]);
  });

  it("supports aspect unlock in capabilities", () => {
    expect(pedalsDefinition.capabilities.supportsAspectUnlock).toBe(true);
    expect(pedalsDefinition.capabilities.inspectorSections).not.toContain("content");
  });
});