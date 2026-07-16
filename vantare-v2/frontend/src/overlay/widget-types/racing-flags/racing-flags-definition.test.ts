import { describe, expect, it } from "vitest";
import { racingFlagsDefinition } from "./racing-flags-definition";

describe("racingFlagsDefinition", () => {
  it("creates a 10Hz flag widget", () => {
    const widget = racingFlagsDefinition.createDefault("flags-1");
    expect(widget.type).toBe("racing-flags");
    expect(widget.behavior.updateHz).toBe(10);
    expect(widget.content).toEqual({ showSectorFlags: true, hideWhenGreen: false });
  });
});
