import { expect, it } from "vitest";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

it("gives only the dedicated report reference a connected service and a real draft reply", () => {
  for (const scene of [
    "testing-tester-report-reference",
    "visual-light:testing-tester-report-reference",
  ]) {
    const host = createMockHost(scene);
    const core = host({
      kind: "request",
      id: 1,
      request: { method: "core.get" },
    });
    expect(isHostMessage(core)).toBe(true);
    expect(core).toMatchObject({
      result: {
        value: {
          services: "connected",
          access: { verified: true, tester: true, calendar: true },
        },
      },
    });
    const draft = host({
      kind: "request",
      id: 2,
      request: { method: "draft.load" },
    });
    expect(isHostMessage(draft)).toBe(true);
    expect(draft).toMatchObject({
      result: {
        method: "draft.load",
        value: { exists: false, screenshots: [] },
      },
    });
  }
  const other = createMockHost("visual-light:testing-tester-reference");
  expect(
    other({ kind: "request", id: 1, request: { method: "core.get" } }),
  ).toMatchObject({ result: { value: { services: "unavailable" } } });
  expect(
    other({ kind: "request", id: 2, request: { method: "draft.load" } }),
  ).toMatchObject({ kind: "failure", error: { kind: "coreUnavailable" } });
});
