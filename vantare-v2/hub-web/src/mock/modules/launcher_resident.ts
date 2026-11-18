import type {
  HostToUi,
  ResidentAnswerRejection,
  ResidentReviewTarget,
  ResidentView,
} from "../../contract/generated/contract";
import { residentActionLabels } from "../../contract/generated/launcher_resident";
import type { MockContext, MockHandler } from "../context";
import { createLauncherNoticeMock } from "../launcher-notice";
import { createResidentControlMock } from "../resident-control";
import { createResidentRemovalMock } from "../resident-removal";
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
    reviewOutcome: null,
    execution: null,
    ownership: { kind: "unsupported" },
    registrations: [],
  };
  if (
    context.sceneName === "calendar-launch-reference" ||
    context.sceneName === "launcher-ready" ||
    context.sceneName === "launcher-editor-ready" ||
    context.sceneName.startsWith("launcher-editor-custom") ||
    context.sceneName === "inicio-base"
  )
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
      review: "unavailable",
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
  const reviewScene = context.sceneName.startsWith("launcher-review-")
    ? context.sceneName.slice("launcher-review-".length)
    : undefined;
  const checked =
    !!reviewScene || context.sceneName.startsWith("launcher-answer-");
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
      review: "unavailable",
      actions: [
        { id: "reuse", label: residentActionLabels.reuse },
        { id: "restart", label: residentActionLabels.restart },
        { id: "cancel", label: residentActionLabels.cancel },
      ],
    };
    if (reviewScene || context.sceneName === "launcher-answer-trust") {
      context.core.access.verified = true;
      view.decision = {
        id: "2",
        kind: "authorization",
        review:
          reviewScene === "unavailable" || reviewScene === "too-long"
            ? reviewScene
            : "available",
        actions: [
          { id: "trust", label: residentActionLabels.trust },
          { id: "cancel", label: residentActionLabels.cancel },
        ],
      };
      if (reviewScene && context.launcherData && view.execution.question) {
        view.execution.checkedControl = true;
        const launcher = context.launcherData;
        const profile = launcher.profiles[0];
        launcher.apps.forEach((app) => {
          app.available = true;
        });
        if (reviewScene === "too-long") {
          launcher.apps.push({
            id: "custom:1",
            name: "Actualizador de overlays",
            available: true,
          });
          profile.name = "Overlays PRO (pack gratis)";
          profile.apps = ["lmu", "custom:1"];
        }
        view.execution.question = {
          ...view.execution.question,
          revision: launcher.revision,
        };
        view.execution.active = {
          run: "1",
          accountGeneration: "a".repeat(64),
          revision: launcher.revision,
        };
        view.execution.results = {
          kind: "known",
          value: {
            run: "1",
            accountGeneration: "a".repeat(64),
            revision: launcher.revision,
            profile: profile.id,
            mode: "profile",
            outcome: null,
            retryFailed: false,
            steps: profile.apps.map((_, index) => ({
              index,
              state: "pending",
            })),
          },
        };
      }
    }
  }
  const control = createResidentControlMock(context, view, schedule);
  createLauncherNoticeMock(context, view, schedule);
  const results = createResidentResultsMock(context, view, schedule);
  const removal = createResidentRemovalMock(context, view, schedule);
  const event = (): HostToUi => ({
    kind: "event",
    event: { topic: "launcherResident", value: structuredClone(view) },
  });
  let pending:
    | { ticket: string; target: ResidentReviewTarget; deadline?: number }
    | undefined;
  if (reviewScene)
    context.reviewTrust = async (ticket) => {
      if (!pending || pending.ticket !== ticket) return "unavailable";
      const { target } = pending;
      pending = undefined;
      if (reviewScene === "reviewing") return new Promise(() => {});
      if (reviewScene === "unconfirmed") return "submitted";
      if (
        reviewScene === "trusted" ||
        reviewScene === "declined" ||
        reviewScene === "changed" ||
        reviewScene === "expired"
      ) {
        view.reviewOutcome = { question: target.decision, state: reviewScene };
        context.emit?.(event());
        return "submitted";
      }
      return "unavailable";
    };
  const reviewRejection = (
    target: ResidentReviewTarget,
  ): ResidentAnswerRejection | undefined => {
    const execution = view.execution;
    const scope = execution?.question;
    if (!view.online || view.protected || !view.running || !execution || !scope)
      return "unavailable";
    if (target.instance !== execution.instance) return "wrong-instance";
    if (
      target.accountGeneration !== context.core.accountGeneration ||
      target.accountGeneration !== scope.accountGeneration
    )
      return "account-changed";
    if (target.run !== scope.run) return "wrong-run";
    if (target.revision !== scope.revision) return "revision-mismatch";
    if (
      target.decision !== scope.decision ||
      target.decision !== view.decision?.id
    )
      return "stale-question";
    if (view.decision.review !== "available") return "unavailable";
  };
  return (message) => {
    if (
      message.kind === "request" &&
      message.request.method === "launcher.resident.reviewOpen"
    ) {
      const target = message.request.target;
      const reason =
        reviewRejection(target) ??
        (!context.core.access.verified || context.core.access.blocked
          ? "denied"
          : undefined);
      if (reason)
        return {
          kind: "failure",
          id: message.id,
          error: { kind: "residentAnswerRejected", reason },
        };
      const ticket = crypto.randomUUID().replaceAll("-", "");
      pending = { ticket, target };
      view.reviewOutcome = null;
      return {
        kind: "response",
        id: message.id,
        result: { method: "launcher.resident.reviewOpen", value: { ticket } },
      };
    }
    if (
      message.kind === "reviewContentRequest" ||
      message.kind === "reviewDecision"
    ) {
      if (!pending || pending.ticket !== message.ticket)
        return { kind: "reviewFailure", reason: "unavailable" };
      const { target, deadline } = pending;
      const reason =
        deadline !== undefined && performance.now() >= deadline
          ? "expired"
          : reviewRejection(target)
            ? "changed"
            : undefined;
      if (message.kind === "reviewContentRequest") {
        if (reason) return { kind: "reviewFailure", reason };
        pending.deadline ??= performance.now() + 180_000;
        return {
          kind: "reviewContent",
          pages: [
            "Revisa el paso de este perfil importado\n   Programa: QA/app.exe",
          ],
        };
      }
      pending = undefined;
      if (deadline === undefined)
        return { kind: "reviewFailure", reason: "unavailable" };
      const age = Date.now() - (message.issuedMs ?? 0);
      const failure =
        reason ??
        (message.decision === "trust" && (age < 0 || age > 10_000)
          ? "expired"
          : undefined);
      const state =
        failure ??
        (message.decision === "trust"
          ? context.core.access.verified && !context.core.access.blocked
            ? "trusted"
            : "unavailable"
          : "declined");
      view.reviewOutcome = { question: target.decision, state };
      context.emit?.(event());
      if (state === "trusted" || state === "declined")
        schedule(() => {
          if (view.decision?.id !== target.decision || !view.execution) return;
          view.decision = null;
          view.execution.question = null;
          view.reviewOutcome = null;
          context.emit?.(event());
        }, 0);
      return failure ? { kind: "reviewFailure", reason: failure } : null;
    }
    const removed = removal(message);
    if (removed) return removed;
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
