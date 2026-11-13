import { expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import launcherFixture from "../fixtures/launcher-base.json";
import type {
  CoreStatus,
  LauncherView,
  ResidentView,
} from "../src/contract/generated/contract";
import { createResidentControlMock } from "../src/mock/resident-control";

function fixture(sceneName = "launcher-control-finished") {
  const core = structuredClone(coreFixture) as CoreStatus;
  core.access.verified = true;
  const document = structuredClone(launcherFixture) as LauncherView;
  document.profiles[0].apps = ["lmu", "obs", "obs"];
  const value: ResidentView = {
    online: true,
    protected: false,
    running: false,
    error: false,
    decision: null,
    execution: null,
    ownership: { kind: "unsupported" },
    registrations: [],
  };
  const emit = vi.fn(),
    tasks: (() => void)[] = [];
  const handle = createResidentControlMock(
    {
      sceneName,
      core,
      launcherData: document,
      visual: null,
      notes: [],
      note: () => {},
      emit,
    },
    value,
    (callback) => tasks.push(callback),
  );
  const target = {
    instance: "b".repeat(64),
    accountGeneration: "a".repeat(64),
    profile: document.profiles[0].id,
    revision: document.revision,
  };
  return { handle, value, document, core, target, emit, tasks };
}
it("publishes Queued, then Accepted, then Finished without changing the profile steps", () => {
  const f = fixture();
  const original = structuredClone(f.document.profiles[0].apps);
  const queued = f.handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.rehearse", target: f.target },
  });
  expect(queued).toMatchObject({
    kind: "response",
    result: { value: { kind: "queued" } },
  });
  expect(f.emit).not.toHaveBeenCalled();
  f.tasks.shift()?.();
  expect(f.value.execution?.active?.run).toBe("1");
  expect(f.value.execution?.events.at(-1)?.kind).toMatchObject({
    kind: "order-received",
    receipt: { kind: "accepted" },
  });
  f.tasks.shift()?.();
  expect(f.value.execution?.events.at(-1)?.kind).toMatchObject({
    kind: "finished",
    outcome: { kind: "completed" },
  });
  expect(f.document.profiles[0].apps).toEqual(original);
  expect(f.value.execution?.active).toBeNull();
});
it("a profile with only LMU is rejected with NoSteps, never Finished", () => {
  const f = fixture();
  f.document.profiles[0].apps = ["lmu"];
  f.handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.rehearse", target: f.target },
  });
  f.tasks.shift()?.();
  expect(f.value.execution?.events.at(-1)?.kind).toMatchObject({
    kind: "order-received",
    receipt: { kind: "rejected", reason: "no-steps" },
  });
  expect(f.tasks).toHaveLength(0);
});
it("has no fallback when capability is unavailable", () => {
  const f = fixture("launcher-control-unsupported");
  const reply = f.handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.rehearse", target: f.target },
  });
  expect(reply).toMatchObject({
    kind: "failure",
    error: { kind: "unsupported" },
  });
  expect(f.tasks).toHaveLength(0);
});
it("cancels only the active captured run", () => {
  const f = fixture("launcher-control-cancel"),
    active = f.value.execution?.active;
  if (!active) throw new Error("fixture");
  const wrong = f.handle({
    kind: "request",
    id: 1,
    request: {
      method: "launcher.resident.cancel",
      target: { instance: "b".repeat(64), ...active, run: "2" },
    },
  });
  expect(wrong).toMatchObject({
    kind: "failure",
    error: { kind: "residentControlRejected", reason: "wrong-run" },
  });
  const queued = f.handle({
    kind: "request",
    id: 2,
    request: {
      method: "launcher.resident.cancel",
      target: { instance: "b".repeat(64), ...active },
    },
  });
  expect(queued?.kind).toBe("response");
  f.tasks.shift()?.();
  expect(f.value.running).toBe(true);
  f.tasks.shift()?.();
  expect(f.value.execution?.events.at(-1)?.kind).toMatchObject({
    kind: "finished",
    outcome: { kind: "cancelled" },
  });
});

it("rejects a queued rehearsal if the observed account changes before consumption", () => {
  const f = fixture();
  f.handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.resident.rehearse", target: f.target },
  });
  f.core.accountGeneration = "e".repeat(64);
  f.tasks.shift()?.();
  expect(f.value.execution?.events.at(-1)?.kind).toMatchObject({
    kind: "order-received",
    receipt: { kind: "rejected", reason: "account-changed" },
  });
  expect(f.value.execution?.active).toBeNull();
  expect(f.value.running).toBe(false);
  expect(f.tasks).toHaveLength(0);
});

import { create as createResidentMock } from "../src/mock/modules/launcher_resident";

it("keeps the event ring valid when cancellation asks how to close applications", () => {
  const f = fixture();
  const tasks: (() => void)[] = [];
  const handle = createResidentMock(
    {
      sceneName: "launcher-control-closing",
      core: f.core,
      launcherData: f.document,
      visual: null,
      notes: [],
      note: () => {},
    },
    (callback) => tasks.push(callback),
  );
  function snapshot() {
    const reply = handle({
      kind: "request",
      id: 1,
      request: { method: "launcher.resident.get" },
    });
    if (
      reply?.kind !== "response" ||
      !("result" in reply) ||
      reply.result.method !== "launcher.resident.get"
    )
      throw new Error("resident snapshot missing");
    return reply.result.value;
  }
  const initial = snapshot().execution;
  if (!initial?.active) throw new Error("active execution missing");
  handle({
    kind: "request",
    id: 2,
    request: {
      method: "launcher.resident.cancel",
      target: { instance: initial.instance, ...initial.active },
    },
  });
  tasks.shift()?.();
  const question = snapshot().execution?.question;
  if (!question) throw new Error("closing question missing");
  handle({
    kind: "request",
    id: 3,
    request: {
      method: "launcher.resident.answer",
      target: { instance: initial.instance, ...question, action: "leave" },
    },
  });
  tasks.shift()?.();
  tasks.shift()?.();
  const final = snapshot().execution;
  if (!final) throw new Error("final execution missing");
  const seq = final.events.map((event) => BigInt(event.seq));
  expect(
    seq.every((value, index) => index === 0 || value > seq[index - 1]),
  ).toBe(true);
  expect(final.events.at(-1)?.kind).toMatchObject({
    kind: "finished",
    outcome: { kind: "cancelled" },
  });
  expect(final.active).toBeNull();
});
