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
    expect(deltaDefinition.parseContent({})).toEqual({ reference: "personal-best" });
    expect(deltaDefinition.parseContent(undefined)).toEqual({ reference: "personal-best" });
  });

  it("declares a per-widget selector for every supported delta reference", () => {
    expect(deltaDefinition.inspector.content).toEqual([
      expect.objectContaining({
        kind: "select",
        path: "reference",
        defaultValue: "personal-best",
        options: [
          expect.objectContaining({ value: "personal-best" }),
          expect.objectContaining({ value: "session-best" }),
          expect.objectContaining({ value: "previous-lap" }),
        ],
      }),
    ]);
    expect(deltaDefinition.parseContent({ reference: "session-best" })).toEqual({ reference: "session-best" });
    expect(deltaDefinition.parseContent({ reference: "previous-lap" })).toEqual({ reference: "previous-lap" });
    expect(() => deltaDefinition.parseContent({ reference: "invented" })).toThrow(/reference/i);
  });

  it("rejects non-object content", () => {
    expect(() => deltaDefinition.parseContent("invalid")).toThrow(/content/i);
  });

});
