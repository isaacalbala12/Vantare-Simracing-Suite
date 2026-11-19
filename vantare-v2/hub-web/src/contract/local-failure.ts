import type { HostToUi } from "./generated/contract";
import { exact, integer, record } from "./validation-common";

// Local Hub failure (#2697), never part of the wire contract. The host never
// sends it and `isHostMessage` rejects it. Main creates it when a host reply
// fails validation, so only the Hub is blamed. It reuses the generic `io` error
// for existing code; `local` marks it for the bridge, which turns it into
// `InvalidHostResponse`.
export type InvalidResponseFailure = Extract<HostToUi, { kind: "failure" }> & {
  local: "invalidResponse";
};
export function invalidResponseFailure(id: number): HostToUi {
  const failure: InvalidResponseFailure = {
    kind: "failure",
    id,
    error: { kind: "io" },
    local: "invalidResponse",
  };
  return failure;
}
export function isInvalidResponseFailure(
  value: unknown,
): value is InvalidResponseFailure {
  return (
    record(value) &&
    exact(value, ["kind", "id", "error", "local"]) &&
    value.kind === "failure" &&
    integer(value.id) &&
    value.id > 0 &&
    value.local === "invalidResponse" &&
    record(value.error) &&
    exact(value.error, ["kind"]) &&
    value.error.kind === "io"
  );
}
// Minimal read of a message that failed validation: only `kind` and `id`, and
// only when it can answer one pending request. The content is never looked at.
export function readReplyEnvelope(
  value: unknown,
): { kind: "response" | "failure"; id: number } | undefined {
  if (!record(value)) return undefined;
  const { kind, id } = value;
  if ((kind !== "response" && kind !== "failure") || !integer(id) || id < 1)
    return undefined;
  return { kind, id };
}
