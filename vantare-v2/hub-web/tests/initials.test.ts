import { describe, expect, it } from "vitest";
import { createMockHost } from "../src/mock/host";
import { initials } from "../src/renderer/ui/initials";

describe("native avatar initials", () => {
  it.each([
    ["", "·"],
    ["  ", "·"],
    ["Ana", "A"],
    ["Ana María López", "AM"],
    ["  Isaac   Albalá ", "IA"],
    ["élise øst", "ÉØ"],
  ])("formats %j as %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
  it("reads the visual name through the existing pilot projection", () => {
    const reply = createMockHost("visual-dark:ajustes-con-diseno")({
      kind: "request",
      id: 1,
      request: { method: "pilot.load" },
    });
    expect(reply).toMatchObject({
      kind: "response",
      result: {
        method: "pilot.load",
        value: { fields: { publicName: "Isaac Albalá" } },
      },
    });
    if (reply?.kind !== "response" || reply.result.method !== "pilot.load")
      throw new Error("Missing QA pilot");
    expect(initials(reply.result.value.fields.publicName)).toBe("IA");
  });
  it("grants visual-bank capabilities only to the visual mock scene", () => {
    const request = { kind: "request", id: 1, request: { method: "core.get" } };
    const normal = createMockHost("ajustes-base")(request);
    const visual = createMockHost("visual-dark:ajustes-con-diseno")(request);
    expect(normal).toMatchObject({
      kind: "response",
      result: { value: { access: { verified: false, calendar: false } } },
    });
    expect(visual).toMatchObject({
      kind: "response",
      result: { value: { access: { verified: true, calendar: true } } },
    });
  });
});
