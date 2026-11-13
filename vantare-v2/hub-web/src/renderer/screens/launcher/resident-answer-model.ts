import {
  type ResidentAnswerRejection,
  type ResidentAnswerTarget,
  type ResidentOutcome,
  type ResidentView,
  residentOrderReceiptTimeoutMs,
} from "../../../contract/generated/launcher_resident";

export type AnswerPhase =
  | { kind: "sending" }
  | { kind: "queued"; request: string; until: number }
  | { kind: "accepted"; request: string }
  | { kind: "rejected"; reason: ResidentAnswerRejection }
  | { kind: "unknown" }
  | { kind: "finished"; outcome: ResidentOutcome };
export type AnswerAttempt = {
  target: ResidentAnswerTarget;
  cursor: bigint;
  phase: AnswerPhase;
};
export function answerCursor(view: ResidentView) {
  const execution = view.execution;
  return execution?.events.length
    ? BigInt(execution.events[execution.events.length - 1].seq)
    : BigInt(execution?.firstRetainedSeq ?? "1") - 1n;
}
export function queuedAnswer(
  attempt: AnswerAttempt,
  request: string,
  now: number,
): AnswerAttempt {
  return {
    ...attempt,
    phase: {
      kind: "queued",
      request,
      until: now + residentOrderReceiptTimeoutMs,
    },
  };
}
// Only this order's receipt acknowledges it. Started/received/Finished alone do not.
export function observeAnswer(
  attempt: AnswerAttempt,
  view: ResidentView | undefined,
  now: number,
): AnswerAttempt {
  if (attempt.phase.kind !== "queued" && attempt.phase.kind !== "accepted")
    return attempt;
  const execution = view?.execution;
  const unknown = (): AnswerAttempt => ({
    ...attempt,
    phase: { kind: "unknown" },
  });
  if (
    !view?.online ||
    view.protected ||
    !execution?.checkedAnswer ||
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
      if (value.receipt.kind === "rejected")
        return {
          ...next,
          phase: { kind: "rejected", reason: value.receipt.reason },
        };
      if (value.receipt.run !== next.target.run) return unknown();
      next = {
        ...next,
        phase: { kind: "accepted", request: next.phase.request },
      };
    } else if (
      next.phase.kind === "accepted" &&
      value.kind === "finished" &&
      value.run === next.target.run
    ) {
      return { ...next, phase: { kind: "finished", outcome: value.outcome } };
    }
  }
  if (next.phase.kind === "queued" && now >= next.phase.until)
    return { ...next, phase: { kind: "unknown" } };
  return next;
}
