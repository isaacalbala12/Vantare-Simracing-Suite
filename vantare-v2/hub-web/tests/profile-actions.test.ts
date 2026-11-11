import { describe, expect, it } from "vitest";
import { isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

const revision = "0".repeat(64);
const accepts = (request: unknown) =>
  isUiMessage({ kind: "request", id: 1, request });
describe("closed profile actions", () => {
  it("accepts only typed actions with a revision", () => {
    for (const method of [
      "launcher.profile.delete",
      "launcher.profile.duplicate",
    ]) {
      expect(accepts({ method, id: "qa", baseRevision: revision })).toBe(true);
      expect(
        accepts({ method, id: "qa", baseRevision: revision, args: ["--qa"] }),
      ).toBe(false);
      expect(accepts({ method, id: "qa" })).toBe(false);
      expect(accepts({ method, id: "\0", baseRevision: revision })).toBe(false);
    }
  });
  it("rejects free options, arguments and values outside native limits", () => {
    const request = {
      method: "launcher.profile.option",
      id: "qa",
      baseRevision: revision,
    };
    expect(
      accepts({ ...request, patch: { option: "retries", value: 3 } }),
    ).toBe(true);
    for (const patch of [
      { option: "retries", value: 4 },
      { option: "args", value: [] },
      { option: "startup", value: "true" },
      { option: "failure", value: "execute" },
    ])
      expect(accepts({ ...request, patch })).toBe(false);
    expect(
      accepts({
        method: "launcher.profile.favorite",
        id: "qa",
        favorite: true,
        baseRevision: revision,
      }),
    ).toBe(true);
    expect(
      accepts({ method: "launcher.trigger", id: null, baseRevision: revision }),
    ).toBe(true);
  });
  it("denies an unknown trigger identity without modifying the view", () => {
    const host = createMockHost("launcher-base");
    const get = () =>
      host({ kind: "request", id: 1, request: { method: "launcher.get" } });
    const before = get();
    if (before?.kind !== "response" || before.result.method !== "launcher.get")
      throw Error("launcher response");
    expect(
      host({
        kind: "request",
        id: 2,
        request: {
          method: "launcher.trigger",
          id: "unknown",
          baseRevision: before.result.value.revision,
        },
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
    expect(get()).toEqual(before);
  });
  it("accepts only native quick-delay choices and no longer exposes retry mode", () => {
    const base = {
      method: "launcher.profile.option",
      id: "creator",
      baseRevision: revision,
    };
    for (const value of [0, 5, 10, 20, 30, 60])
      expect(
        accepts({ ...base, patch: { option: "firstStepDelay", value } }),
      ).toBe(true);
    for (const value of [17, 18, 999])
      expect(
        accepts({ ...base, patch: { option: "firstStepDelay", value } }),
      ).toBe(false);
    expect(
      accepts({ ...base, patch: { option: "retryFailed", value: true } }),
    ).toBe(false);
  });
});
