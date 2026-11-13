import type { HostToUi, ResidentView } from "../../contract/generated/contract";
import { residentActionLabels } from "../../contract/generated/launcher_resident";
import type { MockContext, MockHandler } from "../context";
import { createResidentControlMock } from "../resident-control";
import { createResidentResultsMock } from "../resident-results";
export const residentMockFinishDelayMs = 1000;
export function create(
  context: MockContext,
  schedule: (callback: () => void, delay: number) => unknown = setTimeout,
): MockHandler {
  const offline = context.sceneName === "launcher-offline";
  const view: ResidentView = {
    protected: false,
    online: !offline,
    running: false,
    error: false,
    decision: null,
    execution: null,
    registrations: [],
  };
  if (context.sceneName === "calendar-launch-reference")
    view.execution = {
      instance: "b".repeat(64),
      revisionCheckedLaunch: true,
      checkedAnswer: false,
      checkedControl: false,
      results: { kind: "unsupported" },
      active: null,
      question: null,
      firstRetainedSeq: "1",
      events: [],
    };
  if (context.sceneName === "launcher-decision") {
    view.running = true;
    view.decision = {
      id: "18446744073709551615",
      kind: "authorization",
      actions: [
        { id: "trust", label: residentActionLabels.trust },
        { id: "cancel", label: residentActionLabels.cancel },
      ],
    };
  }
  if (context.sceneName === "launcher-shortcuts")
    view.registrations = [
      {
        id: "creator",
        name: "Creator",
        hotkey: "ctrl+shift+1",
        state: "registered",
      },
      { id: "pro", name: "Pro", hotkey: "ctrl+shift+2", state: "error" },
    ];
  const checked = context.sceneName.startsWith("launcher-answer-");
  if (checked) {
    context.core.accountGeneration = "a".repeat(64);
    context.core.services = "connected";
    view.running = true;
    view.execution = {
      instance: "b".repeat(64),
      revisionCheckedLaunch: true,
      checkedAnswer: true,
      checkedControl: false,
      results: { kind: "unsupported" },
      active: null,
      question: {
        decision: "2",
        run: "1",
        revision: "c".repeat(64),
        accountGeneration: "a".repeat(64),
      },
      firstRetainedSeq: "1",
      events: [{ seq: "1", kind: { kind: "started", run: "1" } }],
    };
    view.decision = {
      id: "2",
      kind: "alreadyRunning",
      actions: [
        { id: "reuse", label: residentActionLabels.reuse },
        { id: "restart", label: residentActionLabels.restart },
        { id: "cancel", label: residentActionLabels.cancel },
      ],
    };
    if (context.sceneName === "launcher-answer-trust")
      view.decision = {
        id: "2",
        kind: "authorization",
        actions: [
          { id: "trust", label: residentActionLabels.trust },
          { id: "cancel", label: residentActionLabels.cancel },
        ],
      };
  }
  const control = createResidentControlMock(context, view, schedule);
  const results = createResidentResultsMock(context, view, schedule);
  const event = (): HostToUi => ({
    kind: "event",
    event: { topic: "launcherResident", value: structuredClone(view) },
  });
  return (message) => {
    const retry = results(message);
    if (retry) return retry;
    const controlled = control(message);
    if (controlled) return controlled;
    if (message.kind === "subscribe" && message.topic === "launcherResident")
      return event();
    if (
      message.kind === "request" &&
      message.request.method === "launcher.resident.answer" &&
      (checked || context.sceneName === "launcher-control-closing")
    ) {
      const target = message.request.target;
      const scope = view.execution?.question;
      const reject = (
        reason: import("../../contract/generated/launcher_resident").ResidentAnswerRejection,
      ): HostToUi => ({
        kind: "failure",
        id: message.id,
        error: { kind: "residentAnswerRejected", reason },
      });
      if (
        !view.online ||
        view.protected ||
        context.core.services !== "connected"
      )
        return reject("unavailable");
      if (target.action === "trust") return reject("trust-requires-editor");
      if (target.accountGeneration !== context.core.accountGeneration)
        return reject("account-changed");
      if (target.instance !== view.execution?.instance)
        return reject("wrong-instance");
      if (
        !scope ||
        target.decision !== scope.decision ||
        target.run !== scope.run ||
        target.revision !== scope.revision
      )
        return reject("stale-question");
      if (!view.decision?.actions.some((choice) => choice.id === target.action))
        return reject("invalid-action");
      if (
        ["reuse", "restart", "continue"].includes(target.action) &&
        (!context.core.access.verified || context.core.access.blocked)
      )
        return reject("denied");
      const request = "d".repeat(32);
      if (context.sceneName !== "launcher-answer-unknown")
        schedule(() => {
          if (!view.execution) return;
          view.execution.events.push({
            seq: String(BigInt(view.execution.events.at(-1)?.seq ?? "0") + 1n),
            kind: {
              kind: "order-received",
              request,
              receipt: context.sceneName.includes("-rejected")
                ? {
                    kind: "rejected",
                    reason: context.sceneName.endsWith("-account")
                      ? "account-changed"
                      : context.sceneName.endsWith("-denied")
                        ? "denied"
                        : context.sceneName.endsWith("-unavailable")
                          ? "unavailable"
                          : "stale-question",
                  }
                : { kind: "accepted", run: scope.run },
            },
          });
          view.execution.question = null;
          view.decision = null;
          context.emit?.(event());
          if (
            context.sceneName === "launcher-answer-finished" ||
            context.sceneName === "launcher-control-closing"
          )
            schedule(() => {
              if (!view.execution) return;
              view.execution.events.push({
                seq: String(
                  BigInt(view.execution.events.at(-1)?.seq ?? "0") + 1n,
                ),
                kind: {
                  kind: "finished",
                  run: scope.run,
                  outcome:
                    context.sceneName === "launcher-control-closing"
                      ? { kind: "cancelled", reason: "user" }
                      : { kind: "completed" },
                },
              });
              view.running = false;
              view.execution.active = null;
              if (
                context.launcherData &&
                context.sceneName === "launcher-control-closing"
              ) {
                context.launcherData.running = false;
                context.emit?.({
                  kind: "event",
                  event: {
                    topic: "launcher",
                    value: structuredClone(context.launcherData),
                  },
                });
              }
              context.emit?.(event());
            }, residentMockFinishDelayMs);
        }, 0);
      return {
        kind: "response",
        id: message.id,
        result: {
          method: "launcher.resident.answer",
          value: { kind: "queued", request },
        },
      };
    }
    if (
      message.kind !== "request" ||
      message.request.method !== "launcher.resident.get"
    )
      return undefined;
    return {
      kind: "response",
      id: message.id,
      result: { method: "launcher.resident.get", value: structuredClone(view) },
    };
  };
}
