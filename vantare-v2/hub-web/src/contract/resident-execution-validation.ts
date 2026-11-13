import { exact, oneOf, record } from "./validation-common";

function decimal(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9][0-9]{0,19}$/.test(value) &&
    BigInt(value) <= 18446744073709551615n
  );
}
function hex(value: unknown, length: number): boolean {
  return (
    typeof value === "string" &&
    value.length === length &&
    /^[0-9a-f]+$/.test(value)
  );
}
export function isResidentOutcome(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === "completed") return exact(value, ["kind"]);
  return (
    exact(value, ["kind", "reason"]) &&
    ((value.kind === "failed" &&
      oneOf(value.reason, [
        "step-failed",
        "decision-expired",
        "cleanup-failed",
        "worker-panicked",
        "internal",
      ])) ||
      (value.kind === "cancelled" &&
        oneOf(value.reason, ["user", "shutdown", "trust-declined"])))
  );
}
function event(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, ["seq", "kind"]) ||
    !decimal(value.seq) ||
    !record(value.kind)
  )
    return false;
  const kind = value.kind;
  const valueSeq = value.seq;
  const run = (value: unknown) =>
    decimal(value) && BigInt(value) <= BigInt(valueSeq);
  if (kind.kind === "started")
    return exact(kind, ["kind", "run"]) && run(kind.run);
  if (kind.kind === "finished")
    return (
      exact(kind, ["kind", "run", "outcome"]) &&
      run(kind.run) &&
      isResidentOutcome(kind.outcome)
    );
  if (
    kind.kind !== "received" ||
    !exact(kind, ["kind", "request", "receipt"]) ||
    !hex(kind.request, 32) ||
    !record(kind.receipt)
  )
    return false;
  const receipt = kind.receipt;
  if (receipt.kind === "accepted")
    return exact(receipt, ["kind", "run"]) && run(receipt.run);
  return (
    receipt.kind === "rejected" &&
    exact(receipt, ["kind", "reason"]) &&
    isResidentRejection(receipt.reason)
  );
}
export function isResidentExecution(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "instance",
      "revisionCheckedLaunch",
      "firstRetainedSeq",
      "events",
    ]) ||
    !hex(value.instance, 64) ||
    typeof value.revisionCheckedLaunch !== "boolean" ||
    !decimal(value.firstRetainedSeq) ||
    !Array.isArray(value.events) ||
    value.events.length > 32 ||
    !value.events.every(event)
  )
    return false;
  if (value.events.length === 0) return value.firstRetainedSeq === "1";
  let expected = BigInt(value.firstRetainedSeq);
  for (const item of value.events) {
    if (!record(item) || !decimal(item.seq) || BigInt(item.seq) !== expected)
      return false;
    expected++;
  }
  return true;
}

export function isResidentRejection(value: unknown): boolean {
  return oneOf(value, [
    "busy",
    "wrong-instance",
    "revision-mismatch",
    "document-unavailable",
    "account-changed",
    "authority-unavailable",
    "denied",
    "start-failed",
  ]);
}
