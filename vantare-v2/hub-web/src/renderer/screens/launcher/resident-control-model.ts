import {
  type ResidentCancelTarget,
  type ResidentOrderRejection,
  type ResidentOutcome,
  type ResidentRehearseTarget,
  type ResidentView,
  residentOrderReceiptTimeoutMs,
  residentOrderRejections,
} from "../../../contract/generated/launcher_resident";
import { answerCursor } from "./resident-answer-model";

// UI notice lifetime; independent of the native order-receipt deadline.
export const residentTerminalNoticeMs = 10000;
export type ControlRejection =
  | ResidentOrderRejection
  | "unsupported"
  | "rejected";
export type ControlIntent =
  | { kind: "cancel"; target: ResidentCancelTarget }
  | { kind: "rehearse"; target: ResidentRehearseTarget };
export type ControlPhase =
  | { kind: "sending" }
  | { kind: "queued"; request: string; until: number }
  | { kind: "accepted"; request: string; run: string }
  | { kind: "rejected"; reason: ControlRejection }
  | { kind: "unknown" }
  | { kind: "finished"; outcome: ResidentOutcome };
export type ControlAttempt = ControlIntent & {
  cursor: bigint;
  phase: ControlPhase;
};
export function sameControlIntent(a: ControlIntent, b: ControlIntent) {
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
    !execution?.checkedControl ||
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
        if (!residentOrderRejections.some((allowed) => allowed === reason))
          return unknown();
        return { ...next, phase: { kind: "rejected", reason } };
      }
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
