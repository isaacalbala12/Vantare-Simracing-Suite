import type {
  HostToUi,
  ResidentOrderRejection,
  ResidentView,
} from "../contract/generated/contract";
import type { MockContext, MockHandler } from "./context";
export const controlMockFinishDelayMs = 1000;
export function createResidentControlMock(
  context: MockContext,
  view: ResidentView,
  schedule: (callback: () => void, delay: number) => unknown,
): MockHandler {
  const scene = context.sceneName;
  if (!scene.startsWith("launcher-control-")) return () => undefined;
  context.core.accountGeneration = "a".repeat(64);
  context.core.services = "connected";
  view.execution = {
    instance: "b".repeat(64),
    revisionCheckedLaunch: true,
    checkedAnswer: true,
    checkedControl: scene !== "launcher-control-unsupported",
    results: { kind: "unsupported" },
    active: null,
    question: null,
    firstRetainedSeq: "1",
    events: [],
  };
  const doc = context.launcherData;
  if (
    scene === "launcher-control-cancel" ||
    scene === "launcher-control-closing" ||
    scene === "launcher-control-missing-document"
  ) {
    view.running = true;
    view.execution.active = {
      run: "1",
      revision: doc?.revision ?? "c".repeat(64),
      accountGeneration: "a".repeat(64),
    };
    view.execution.events.push({
      seq: "1",
      kind: { kind: "started", run: "1" },
    });
    if (doc) doc.running = true;
  }
  if (scene === "launcher-control-missing-document" && doc) {
    doc.protected = true;
    doc.profiles = [];
  }
  let queued = false,
    serial = 0;
  const publish = () => {
    if (context.launcherData)
      context.emit?.({
        kind: "event",
        event: {
          topic: "launcher",
          value: structuredClone(context.launcherData),
        },
      });
    context.emit?.({
      kind: "event",
      event: { topic: "launcherResident", value: structuredClone(view) },
    });
  };
  const seq = () =>
    String(BigInt(view.execution?.events.at(-1)?.seq ?? "0") + 1n);
  return (message) => {
    if (
      message.kind !== "request" ||
      (message.request.method !== "launcher.resident.cancel" &&
        message.request.method !== "launcher.resident.rehearse")
    )
      return undefined;
    const request = message.request,
      target = request.target,
      execution = view.execution;
    const reject = (reason: ResidentOrderRejection): HostToUi => ({
      kind: "failure",
      id: message.id,
      error: { kind: "residentControlRejected", reason },
    });
    if (!execution?.checkedControl)
      return {
        kind: "failure",
        id: message.id,
        error: { kind: "unsupported" },
      };
    if (!view.online || view.protected || context.core.services !== "connected")
      return reject("unavailable");
    if (target.instance !== execution.instance) return reject("wrong-instance");
    if (target.accountGeneration !== context.core.accountGeneration)
      return reject("account-changed");
    if (queued) return reject("busy");
    const cancelling = request.method === "launcher.resident.cancel";
    if (cancelling) {
      if (!execution.active || execution.active.run !== request.target.run)
        return reject("wrong-run");
      if (execution.active.revision !== target.revision)
        return reject("revision-mismatch");
    } else {
      if (
        !context.core.access.verified ||
        context.core.access.blocked ||
        context.core.live
      )
        return reject("denied");
      if (view.running) return reject("busy");
      if (
        !doc ||
        doc.protected ||
        !doc.profiles.some((profile) => profile.id === request.target.profile)
      )
        return reject("document-unavailable");
      if (doc.revision !== target.revision) return reject("revision-mismatch");
    }
    queued = true;
    const id = (++serial).toString(16).padStart(32, "0");
    if (scene !== "launcher-control-unknown")
      schedule(() => {
        queued = false;
        const empty =
          !cancelling &&
          doc?.profiles
            .find((profile) => profile.id === request.target.profile)
            ?.apps.every((app) => app === "lmu");
        let rejection: ResidentOrderRejection | undefined = empty
          ? "no-steps"
          : scene === "launcher-control-rejected"
            ? "start-failed"
            : undefined;
        if (target.accountGeneration !== context.core.accountGeneration)
          rejection = "account-changed";
        else if (target.instance !== view.execution?.instance)
          rejection = "wrong-instance";
        else if (
          !cancelling &&
          (!context.core.access.verified ||
            context.core.access.blocked ||
            context.core.live)
        )
          rejection = "denied";
        else if (!cancelling && doc?.revision !== target.revision)
          rejection = "revision-mismatch";
        const rejected = rejection !== undefined;
        let run = execution.active?.run;
        if (!rejected && !run) {
          run = seq();
          execution.events.push({ seq: run, kind: { kind: "started", run } });
        }
        execution.events.push({
          seq: seq(),
          kind: {
            kind: "order-received",
            request: id,
            receipt: rejected
              ? {
                  kind: "rejected",
                  reason: rejection ?? "start-failed",
                }
              : { kind: "accepted", run: run ?? "1" },
          },
        });
        if (!rejected) {
          execution.active = {
            run: run ?? "1",
            revision: target.revision,
            accountGeneration: target.accountGeneration,
          };
          view.running = true;
          if (doc) doc.running = true;
        }
        if (
          !rejected &&
          cancelling &&
          scene === "launcher-control-closing" &&
          execution.active
        ) {
          execution.question = { ...execution.active, decision: seq() };
          view.decision = {
            id: execution.question.decision,
            kind: "closing",
            actions: [
              { id: "leave", label: "Dejar abiertas" },
              { id: "close-started", label: "Cerrar solo las iniciadas" },
            ],
          };
        }
        publish();
        if (
          !rejected &&
          (scene === "launcher-control-finished" ||
            (cancelling && scene !== "launcher-control-closing"))
        )
          schedule(() => {
            execution.events.push({
              seq: seq(),
              kind: {
                kind: "finished",
                run: run ?? "1",
                outcome: cancelling
                  ? { kind: "cancelled", reason: "user" }
                  : { kind: "completed" },
              },
            });
            execution.active = null;
            view.running = false;
            if (doc) doc.running = false;
            publish();
          }, controlMockFinishDelayMs);
      }, 0);
    return {
      kind: "response",
      id: message.id,
      result: {
        method: request.method,
        value: { kind: "queued", request: id },
      },
    };
  };
}
