import type {
  ResidentRemovalRejection,
  ResidentRemoveTarget,
  ResidentView,
} from "../../../contract/generated/contract";
import { residentOrderReceiptTimeoutMs } from "../../../contract/generated/launcher_resident";
import { answerCursor } from "./resident-answer-model";
// UI watchdog after acceptance: expiration is uncertainty, never cancellation or failure.
export const removalFinishedWaitMs = 30_000;
export type RemovalReason =
  | ResidentRemovalRejection
  | "unsupported"
  | "rejected"
  | "unavailable";
export type RemovalAttempt = {
  target: ResidentRemoveTarget;
  cursor: bigint;
  phase:
    | { kind: "sending" }
    | { kind: "queued"; request: string; until: number }
    | { kind: "accepted"; request: string; until: number }
    | { kind: "rejected"; reason: RemovalReason }
    | { kind: "unknown" }
    | { kind: "removed"; revision: string };
};
export function sameRemoval(a: ResidentRemoveTarget, b: ResidentRemoveTarget) {
  return (
    a.instance === b.instance &&
    a.accountGeneration === b.accountGeneration &&
    a.profile === b.profile &&
    a.revision === b.revision
  );
}
export function queueRemoval(
  attempt: RemovalAttempt,
  request: string,
  now: number,
): RemovalAttempt {
  return {
    ...attempt,
    phase: {
      kind: "queued",
      request,
      until: now + residentOrderReceiptTimeoutMs,
    },
  };
}
export function observeRemoval(
  attempt: RemovalAttempt,
  view: ResidentView | undefined,
  now: number,
): RemovalAttempt {
  if (attempt.phase.kind !== "queued" && attempt.phase.kind !== "accepted")
    return attempt;
  if (now >= attempt.phase.until)
    return { ...attempt, phase: { kind: "unknown" } };
  const unknown = (): RemovalAttempt => ({
    ...attempt,
    phase: { kind: "unknown" },
  });
  const execution = view?.execution;
  if (
    !view?.online ||
    view.protected ||
    !execution ||
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
      value.kind === "removal-received" &&
      value.request === next.phase.request
    ) {
      if (value.receipt.kind === "rejected")
        return {
          ...next,
          phase: { kind: "rejected", reason: value.receipt.reason },
        };
      next = {
        ...next,
        phase: {
          kind: "accepted",
          request: next.phase.request,
          until: now + removalFinishedWaitMs,
        },
      };
    } else if (
      next.phase.kind === "accepted" &&
      value.kind === "removal-finished" &&
      value.request === next.phase.request
    ) {
      return {
        ...next,
        phase:
          value.outcome.kind === "removed"
            ? { kind: "removed", revision: value.outcome.revision }
            : { kind: "rejected", reason: value.outcome.reason },
      };
    }
  }
  return next;
}
