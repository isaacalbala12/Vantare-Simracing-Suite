import { describe, expect, it } from "vitest";
import { isUiMessage } from "../src/contract/validation";

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
});
