import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import { isReply, isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";
import { requestOf, requests } from "./strategy-corpus";

const compute = requestOf("strategy.compute");
if (compute?.method !== "strategy.compute" || !compute.form)
  throw Error("Missing Strategy calculation sample");

it("calculates through view and accepts cancellation without a late result", () => {
  const host = createMockHost("strategy-ready");
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request });
  send({ method: "strategy.open" });

  expect(isRequest(compute)).toBe(true);
  expect(
    isRequest({ ...compute, form: { ...compute.form, path: "private" } }),
  ).toBe(false);
  expect(send(compute)).toMatchObject({
    kind: "response",
    result: { value: { plan: { state: "calculating", computeId: 1 } } },
  });
  expect(send(compute)).toMatchObject({
    kind: "failure",
    error: { kind: "busy" },
  });
  // a stale id never cancels the running calculation
  expect(send({ method: "strategy.cancel", computeId: 99 })).toMatchObject({
    kind: "response",
    result: { value: { plan: { state: "calculating", computeId: 1 } } },
  });
  expect(send({ method: "strategy.cancel", computeId: 1 })).toMatchObject({
    kind: "response",
    result: {
      value: { plan: { state: "uncalculated", computeId: null, result: null } },
    },
  });
  expect(send({ method: "strategy.view" })).toMatchObject({
    kind: "response",
    result: { value: { plan: { state: "uncalculated", result: null } } },
  });
  send(compute);
  expect(send({ method: "strategy.view" })).toMatchObject({
    kind: "response",
    result: {
      value: {
        dirty: true,
        plan: {
          state: "calculated",
          computeId: 2,
          result: { degraded: false, steps: { fuelLiters: 1, vePercent: 1 } },
        },
      },
    },
  });
});

it("accepts only an opaque positive compute id in a cancel request", () => {
  for (const computeId of [1, 7, 0xffffffff])
    expect(isRequest({ method: "strategy.cancel", computeId })).toBe(true);
  for (const computeId of [0, -1, 1.5, 0x100000000, "7", null, undefined])
    expect(isRequest({ method: "strategy.cancel", computeId })).toBe(false);
  expect(isRequest({ method: "strategy.cancel" })).toBe(false);
  expect(isRequest({ method: "strategy.cancel", computeId: 1, x: 1 })).toBe(
    false,
  );
});

const views = corpus.host.filter(
  (message) => message.result?.method === "strategy.view",
);
type Loose = {
  value: {
    plan: {
      computeId: unknown;
      error: unknown;
      errorField: unknown;
      result: { degraded?: unknown };
    };
  };
};
const planWith = (state: string, errorField?: unknown): Loose => {
  const found = views.find((m) => m.result?.value.plan.state === state);
  if (!found?.result) throw Error(`Missing ${state} sample`);
  const reply = structuredClone(found.result) as unknown as Loose;
  if (errorField !== undefined) reply.value.plan.errorField = errorField;
  return reply;
};

it("keeps compute ids, the degraded flag and the error field closed", () => {
  expect(isReply(planWith("calculated"))).toBe(true);
  expect(isReply(planWith("partial"))).toBe(true);
  // the error sample names raceLaps; null means no single field is to blame
  expect(isReply(planWith("error"))).toBe(true);
  expect(isReply(planWith("error", null))).toBe(true);
  expect(isReply(planWith("error", "raceLaps"))).toBe(true);
  for (const bad of ["path", "RaceLaps", "", 3, ["raceLaps"]])
    expect(isReply(planWith("error", bad))).toBe(false);

  const withoutId = planWith("calculated");
  withoutId.value.plan.computeId = null;
  expect(isReply(withoutId)).toBe(false);
  const zero = planWith("calculated");
  zero.value.plan.computeId = 0;
  expect(isReply(zero)).toBe(false);
  const flag = planWith("calculated");
  flag.value.plan.result.degraded = "no";
  expect(isReply(flag)).toBe(false);
  const missing = planWith("calculated");
  delete missing.value.plan.result.degraded;
  expect(isReply(missing)).toBe(false);
  // a field is only attributed to an invalid-input error
  const stray = planWith("calculated");
  stray.value.plan.errorField = "raceLaps";
  expect(isReply(stray)).toBe(false);
  const failed = planWith("error");
  failed.value.plan.error = "failed";
  expect(isReply(failed)).toBe(false);
});
