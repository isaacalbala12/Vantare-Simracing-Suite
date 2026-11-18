import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import { isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";

const compute = corpus.ui.find(
  (message) => message.request.method === "strategy.compute",
)?.request;
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
    result: { value: { plan: { state: "calculating" } } },
  });
  expect(send(compute)).toMatchObject({
    kind: "failure",
    error: { kind: "busy" },
  });
  expect(send({ method: "strategy.cancel" })).toMatchObject({
    kind: "response",
    result: { value: { plan: { state: "uncalculated", result: null } } },
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
          result: { steps: { fuelLiters: 1, vePercent: 1 } },
        },
      },
    },
  });
});
