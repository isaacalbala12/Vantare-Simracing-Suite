import { expect, it } from "vitest";
import fixture from "../fixtures/launcher-editor.json";
import {
  isPreparedDuplicate,
  isProfileRequest,
} from "../src/contract/profile-validation";

const revision = "a".repeat(64);
it("closes preparation to a bounded identity and the observed document revision", () => {
  const request = {
    method: "launcher.profile.prepareDuplicate",
    id: "creator",
    baseRevision: revision,
  };
  expect(isProfileRequest(request)).toBe(true);
  for (const patch of [
    { id: "" },
    { id: null },
    { id: "x".repeat(257) },
    { id: "qa\0bad" },
    { baseRevision: "A".repeat(64) },
    { baseRevision: "a".repeat(63) },
    { baseRevision: 7 },
    { arguments: ["--never"] },
    { path: "D:/QA/never.exe" },
    { draft: fixture.draft },
  ])
    expect(isProfileRequest({ ...request, ...patch })).toBe(false);
});
it("accepts only the prepared draft and baseRevision, never opaque command bodies", () => {
  const value = {
    baseRevision: revision,
    draft: { ...structuredClone(fixture.draft), id: "copy-qa" },
  };
  expect(isPreparedDuplicate(value)).toBe(true);
  for (const patch of [
    { baseRevision: "invalid" },
    { baseRevision: null },
    { draft: { ...value.draft, id: null } },
    { revision },
    { argsOverride: ["--never"] },
    { document: {} },
    { draft: { ...value.draft, executable: "D:/QA/never.exe" } },
  ])
    expect(isPreparedDuplicate({ ...value, ...patch })).toBe(false);
  const step = {
    key: "b".repeat(64),
    appId: "lmu",
    delaySeconds: 0,
    hasCustomArguments: true,
  };
  expect(
    isPreparedDuplicate({ ...value, draft: { ...value.draft, steps: [step] } }),
  ).toBe(true);
  expect(
    isPreparedDuplicate({
      ...value,
      draft: {
        ...value.draft,
        steps: [{ ...step, argsOverride: ["--never"] }],
      },
    }),
  ).toBe(false);
});

it("rejects a prepared draft with absent or reused capabilities", () => {
  const step = {
    key: "b".repeat(64),
    appId: "lmu",
    delaySeconds: 0,
    hasCustomArguments: true,
  };
  const base = {
    baseRevision: revision,
    draft: { ...fixture.draft, id: "copy-qa" },
  };
  expect(
    isPreparedDuplicate({
      ...base,
      draft: { ...base.draft, steps: [{ ...step, key: null }] },
    }),
  ).toBe(false);
  expect(
    isPreparedDuplicate({
      ...base,
      draft: { ...base.draft, steps: [step, step] },
    }),
  ).toBe(false);
});
