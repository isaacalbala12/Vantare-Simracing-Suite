import { describe, expect, it } from "vitest";
import { createMockHost, helloForScene } from "../src/mock/host";
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
  it("keeps the visual identity separate from an empty editable pilot profile", () => {
    const reply = createMockHost("visual-dark:ajustes-con-diseno")({
      kind: "request",
      id: 1,
      request: { method: "pilot.load" },
    });
    expect(reply).toMatchObject({
      kind: "response",
      result: {
        method: "pilot.load",
        value: { fields: { publicName: "" } },
      },
    });
    if (reply?.kind !== "response" || reply.result.method !== "pilot.load")
      throw new Error("Missing QA pilot");
    expect(initials(reply.result.value.fields.publicName)).toBe("·");
    const demo = helloForScene("visual-dark:ajustes-con-diseno");
    expect(demo.demo).toBe(true);
    expect(initials(demo.demoName ?? "")).toBe("IA");
    expect(helloForScene("ajustes-base").demoName).toBeNull();
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
