import { describe, expect, it } from "vitest";
import { deltaDefinition } from "./delta-definition";

describe("deltaDefinition", () => {
  it("creates an enabled Original Delta with empty content", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    expect(widget).toMatchObject({
      id: "delta-main",
      type: "delta",
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
  });

  it("parses empty Delta content", () => {
    expect(deltaDefinition.parseContent({})).toEqual({});
    expect(deltaDefinition.parseContent(undefined)).toEqual({});
  });

  it("rejects non-object content", () => {
    expect(() => deltaDefinition.parseContent("invalid")).toThrow(/content/i);
  });
});