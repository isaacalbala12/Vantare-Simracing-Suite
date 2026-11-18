import { expect, it } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import type {
  CoreStatus,
  HostToUi,
  ResidentView,
} from "../src/contract/generated/contract";
import { createMockHostWithTrustedReview } from "../src/mock/host";
import { create } from "../src/mock/modules/launcher_resident";

function fixture(sceneName: string) {
  const emissions: HostToUi[] = [];
  const tasks: (() => void)[] = [];
  const core = structuredClone(coreFixture) as CoreStatus;
  core.services = "connected";
  core.access.verified = true;
  const handle = create(
    {
      sceneName,
      core,
      visual: null,
      notes: [],
      note: () => {},
      emit: (value) => emissions.push(value),
    },
    (callback) => tasks.push(callback),
  );
  const get = handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.get" },
  });
  if (get?.kind !== "response" || get.result.method !== "launcher.resident.get")
    throw new Error("fixture view");
  const view = get.result.value as ResidentView;
  if (!view.execution?.question) throw new Error("fixture scope");
  const reply = handle({
    kind: "request",
    id: 2,
    request: {
      method: "launcher.resident.answer",
      target: {
        ...view.execution.question,
        instance: view.execution.instance,
        action: "reuse",
      },
    },
  });
  return { reply, emissions, tasks };
}
it("returns Queued before the receipt, then Accepted before Finished", () => {
  const { reply, emissions, tasks } = fixture("launcher-answer-finished");
  expect(reply).toMatchObject({
    kind: "response",
    result: { value: { kind: "queued" } },
  });
  expect(emissions).toEqual([]);
  tasks.shift()?.();
  expect(emissions).toHaveLength(1);
  const accepted = emissions[0];
  expect(accepted).toMatchObject({
    kind: "event",
    event: {
      value: {
        execution: {
          events: [
            { kind: { kind: "started" } },
            { kind: { kind: "order-received", receipt: { kind: "accepted" } } },
          ],
        },
      },
    },
  });
  tasks.shift()?.();
  expect(emissions).toHaveLength(2);
  expect(emissions[1]).toMatchObject({
    kind: "event",
    event: {
      value: {
        execution: {
          events: [
            { kind: { kind: "started" } },
            { kind: { kind: "order-received" } },
            { kind: { kind: "finished" } },
          ],
        },
      },
    },
  });
});
it.each([
  ["rejected", "stale-question"],
  ["rejected-account", "account-changed"],
  ["rejected-denied", "denied"],
  ["rejected-unavailable", "unavailable"],
])("scene %s has typed rejection %s", (scene, reason) => {
  const { reply, emissions, tasks } = fixture(`launcher-answer-${scene}`);
  expect(reply?.kind).toBe("response");
  expect(emissions).toEqual([]);
  tasks.shift()?.();
  expect(emissions[0]).toMatchObject({
    kind: "event",
    event: {
      value: {
        execution: {
          events: [
            { kind: { kind: "started" } },
            { kind: { receipt: { kind: "rejected", reason } } },
          ],
        },
      },
    },
  });
});

it("serves review text only through the trusted mock entry point", () => {
  const send = createMockHostWithTrustedReview("launcher-answer-trust");
  const target = {
    instance: "b".repeat(64),
    accountGeneration: "a".repeat(64),
    run: "1",
    revision: "c".repeat(64),
    decision: "2",
  };
  const opened = send({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.reviewOpen", target },
  });
  expect(opened?.kind).toBe("response");
  if (
    opened?.kind !== "response" ||
    opened.result.method !== "launcher.resident.reviewOpen"
  )
    throw new Error("expected review ticket");
  const { ticket } = opened.result.value;
  expect(ticket).toMatch(/^[a-f0-9]{32}$/);
  const request = { kind: "reviewContentRequest", ticket };
  expect(send(request)).toBeNull();
  expect(send.trusted(request)).toMatchObject({ kind: "reviewContent" });
  expect(
    send.trusted({
      kind: "reviewDecision",
      ticket,
      decision: "trust",
      issuedMs: Date.now(),
    }),
  ).toBeNull();
  expect(send.trusted(request)).toEqual({
    kind: "reviewFailure",
    reason: "unavailable",
  });
});
