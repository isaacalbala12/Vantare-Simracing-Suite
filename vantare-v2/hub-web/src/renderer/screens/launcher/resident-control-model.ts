import {
  type ResidentCancelTarget,
  type ResidentOrderRejection,
  type ResidentOutcome,
  type ResidentRehearseTarget,
  type ResidentRetryTarget,
  type ResidentView,
  residentOrderReceiptTimeoutMs,
  residentOrderRejections,
} from "../../../contract/generated/launcher_resident";
import { answerCursor } from "./resident-answer-model";

// UI notice lifetime; independent of the native order-receipt deadline.
export const residentTerminalNoticeMs = 10000;
export type ControlRejection =
  | Exclude<ResidentOrderRejection, "unknown-run" | "no-failed-steps">
  | "unsupported"
  | "rejected";
export function isControlRejection(
  value: ResidentOrderRejection,
): value is Exclude<ResidentOrderRejection, "unknown-run" | "no-failed-steps"> {
  return (
    value !== "unknown-run" &&
    value !== "no-failed-steps" &&
    residentOrderRejections.some((allowed) => allowed === value)
  );
}
export type ControlIntent =
  | { kind: "cancel"; target: ResidentCancelTarget }
  | { kind: "rehearse"; target: ResidentRehearseTarget }
  | { kind: "retry"; target: ResidentRetryTarget };
export type ControlPhase =
  | { kind: "sending" }
  | { kind: "queued"; request: string; until: number }
  | { kind: "accepted"; request: string; run: string }
  | {
      kind: "rejected";
      reason: ControlRejection | "unknown-run" | "no-failed-steps";
    }
  | { kind: "unknown" }
  | { kind: "finished"; outcome: ResidentOutcome };
export type ControlAttempt = ControlIntent & {
  cursor: bigint;
  phase: ControlPhase;
};
export function sameControlIntent(a: ControlIntent, b: ControlIntent) {
  if (a.kind === "retry" && b.kind === "retry")
    return (
      a.target.instance === b.target.instance &&
      a.target.accountGeneration === b.target.accountGeneration &&
      a.target.run === b.target.run &&
      a.target.profile === b.target.profile &&
      a.target.revision === b.target.revision
    );
  return (
    a.kind === b.kind &&
    a.target.instance === b.target.instance &&
    a.target.accountGeneration === b.target.accountGeneration &&
    a.target.revision === b.target.revision &&
    (a.kind === "cancel" && b.kind === "cancel"
      ? a.target.run === b.target.run
      : a.kind === "rehearse" &&
        b.kind === "rehearse" &&
        a.target.profile === b.target.profile)
  );
}
export function observeControl(
  attempt: ControlAttempt,
  view: ResidentView | undefined,
  now: number,
): ControlAttempt {
  if (attempt.phase.kind !== "queued" && attempt.phase.kind !== "accepted")
    return attempt;
  const unknown = (): ControlAttempt => ({
    ...attempt,
    phase: { kind: "unknown" },
  });
  if (attempt.phase.kind === "queued" && now >= attempt.phase.until)
    return unknown();
  const execution = view?.execution;
  if (
    !view?.online ||
    view.protected ||
    !execution ||
    (attempt.kind === "retry" ? execution.results.kind === "unsupported" : !execution.checkedControl) ||
    execution.instance !== attempt.target.instance
  )
    return unknown();
  if (
    BigInt(execution.firstRetainedSeq) > attempt.cursor + 1n ||
    answerCursor(view) < attempt.cursor
  )
    return unknown();
  let next = attempt;
  for (const event of execution.events) {
    if (BigInt(event.seq) <= next.cursor) continue;
    next = { ...next, cursor: BigInt(event.seq) };
    const value = event.kind;
    if (
      next.phase.kind === "queued" &&
      value.kind === "order-received" &&
      value.request === next.phase.request
    ) {
      if (value.receipt.kind === "rejected") {
        const reason = value.receipt.reason;
        if (
          !(next.kind === "retry"
            ? residentOrderRejections.some((value) => value === reason)
            : isControlRejection(reason))
        )
          return unknown();
        return { ...next, phase: { kind: "rejected", reason } };
      }
      if (next.kind === "retry" && value.receipt.run === next.target.run) return unknown();
      if (next.kind === "cancel" && value.receipt.run !== next.target.run)
        return unknown();
      next = {
        ...next,
        phase: {
          kind: "accepted",
          request: next.phase.request,
          run: value.receipt.run,
        },
      };
    } else if (
      next.phase.kind === "accepted" &&
      value.kind === "finished" &&
      value.run === next.phase.run
    )
      return { ...next, phase: { kind: "finished", outcome: value.outcome } };
  }
  return next;
}
export function queuedControl(
  attempt: ControlAttempt,
  request: string,
  now: number,
): ControlAttempt {
  return {
    ...attempt,
    phase: {
      kind: "queued",
      request,
      until: now + residentOrderReceiptTimeoutMs,
    },
  };
}
