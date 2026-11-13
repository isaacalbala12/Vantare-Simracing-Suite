import { expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import launcherFixture from "../fixtures/launcher-base.json";
import type {
  CoreStatus,
  LauncherView,
  ResidentRetryTarget,
  ResidentView,
} from "../src/contract/generated/contract";
import { residentStepLimit } from "../src/contract/generated/launcher_resident";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";
import { createResidentResultsMock } from "../src/mock/resident-results";

function setup(sceneName = "launcher-results-finished") {
  const core = structuredClone(coreFixture) as CoreStatus;
  const launcherData = structuredClone(launcherFixture) as LauncherView;
  const view: ResidentView = {
    online: true,
    protected: false,
    running: false,
    error: false,
    decision: null,
    execution: null,
    registrations: [],
  };
  const tasks: (() => void)[] = [];
  const emit = vi.fn();
  const handle = createResidentResultsMock(
    {
      sceneName,
      core,
      launcherData,
      visual: null,
      notes: [],
      note: () => {},
      emit,
    },
    view,
    (callback) => tasks.push(callback),
  );
  function target(scope: "failed" | "all"): ResidentRetryTarget {
    if (view.execution?.results.kind !== "known") throw new Error("known");
    const value = view.execution.results.value;
    return {
      instance: view.execution.instance,
      accountGeneration: value.accountGeneration,
      run: value.run,
      profile: value.profile,
      revision: value.revision,
      scope,
    };
  }
  return { core, launcherData, view, tasks, handle, target, emit };
}
it("repeats the original rehearsal after a failed-only retry, not the latest NotSelected set", () => {
  const f = setup();
  const apps = structuredClone(f.launcherData.profiles[0].apps);
  const reply = f.handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.retry", target: f.target("failed") },
  });
  expect(reply).toMatchObject({
    kind: "response",
    result: { value: { kind: "queued" } },
  });
  expect(f.emit).not.toHaveBeenCalled();
  f.tasks.shift()?.();
  expect(f.view.running).toBe(true);
  expect(f.view.execution?.events.at(-1)?.kind).toMatchObject({
    kind: "order-received",
    receipt: { kind: "accepted" },
  });
  f.tasks.shift()?.();
  expect(f.view.execution?.results).toMatchObject({
    kind: "known",
    value: {
      outcome: { kind: "completed" },
      steps: [
        { index: 0, state: "not-selected" },
        { index: 1, state: "ready" },
        { index: 2, state: "not-selected" },
      ],
    },
  });
  f.handle({
    kind: "request",
    id: 2,
    request: { method: "launcher.resident.retry", target: f.target("all") },
  });
  f.tasks.shift()?.();
  f.tasks.shift()?.();
  expect(f.view.execution?.results).toMatchObject({
    kind: "known",
    value: {
      mode: "rehearsal",
      steps: [
        { index: 0, state: "not-selected" },
        { index: 1, state: "ready" },
        { index: 2, state: "ready" },
      ],
    },
  });
  expect(f.launcherData.profiles[0].apps).toEqual(apps);
  expect(f.view.running).toBe(false);
});
it("rechecks account scope when the queued retry is consumed", () => {
  const f = setup();
  f.handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.retry", target: f.target("all") },
  });
  f.core.accountGeneration = "e".repeat(64);
  f.tasks.shift()?.();
  expect(f.view.execution?.events.at(-1)?.kind).toMatchObject({
    kind: "order-received",
    receipt: { kind: "rejected", reason: "account-changed" },
  });
  expect(f.view.running).toBe(false);
  expect(f.tasks).toHaveLength(0);
});
it("rejects a second queued order as Busy without a legacy fallback", () => {
  const f = setup();
  const target = f.target("all");
  f.handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.retry", target },
  });
  expect(
    f.handle({
      kind: "request",
      id: 2,
      request: { method: "launcher.resident.retry", target },
    }),
  ).toMatchObject({
    kind: "failure",
    error: { kind: "residentControlRejected", reason: "busy" },
  });
  expect(
    f.handle({
      kind: "request",
      id: 3,
      request: {
        method: "launcher.resident.rehearse",
        target: {
          instance: target.instance,
          accountGeneration: target.accountGeneration,
          profile: target.profile,
          revision: target.revision,
        },
      },
    }),
  ).toBeUndefined();
});

it("passes the strict renderer wire for the published v35 summary, receipt and terminal", async () => {
  vi.useFakeTimers();
  try {
    const events: unknown[] = [];
    const host = createMockHost(
      "visual-dark:launcher-results-finished",
      (event) => events.push(event),
    );
    const opened = host({
      kind: "request",
      id: 1,
      request: { method: "launcher.resident.get" },
    });
    expect(isHostMessage(opened)).toBe(true);
    if (
      opened?.kind !== "response" ||
      opened.result.method !== "launcher.resident.get" ||
      opened.result.value.execution?.results.kind !== "known"
    )
      throw new Error("known snapshot");
    const execution = opened.result.value.execution;
    const value =
      execution.results.kind === "known" ? execution.results.value : undefined;
    if (!value) throw new Error("known");
    const queued = host({
      kind: "request",
      id: 2,
      request: {
        method: "launcher.resident.retry",
        target: {
          instance: execution.instance,
          accountGeneration: value.accountGeneration,
          profile: value.profile,
          revision: value.revision,
          run: value.run,
          scope: "all",
        },
      },
    });
    expect(isHostMessage(queued)).toBe(true);
    expect(queued).toMatchObject({ result: { value: { kind: "queued" } } });
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(isHostMessage)).toBe(true);
    expect(
      host({
        kind: "request",
        id: 3,
        request: { method: "launcher.resident.get" },
      }),
    ).toMatchObject({
      result: {
        value: {
          execution: {
            results: {
              kind: "known",
              value: { retryFailed: false, outcome: { kind: "completed" } },
            },
          },
        },
      },
    });
  } finally {
    vi.useRealTimers();
  }
});

it("keeps a full-size repeated-app profile and all indexed results valid on the wire", () => {
  const host = createMockHost("visual-dark:launcher-results-many");

  const opened = host({
    kind: "request",
    id: 2,
    request: { method: "launcher.resident.get" },
  });
  expect(isHostMessage(opened)).toBe(true);
  if (
    opened?.kind !== "response" ||
    opened.result.method !== "launcher.resident.get" ||
    opened.result.value.execution?.results.kind !== "known"
  )
    throw new Error("known");
  expect(opened.result.value.execution.results.value.steps).toHaveLength(
    residentStepLimit,
  );
  expect(opened.result.value.execution.results.value.steps.at(-1)?.index).toBe(
    residentStepLimit - 1,
  );
});
