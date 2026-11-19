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
// `id` follows the contract range (up to 0xffffffff), which includes the ids Main
// keeps for itself (HOST_BACKGROUND_ID); that is harmless: Main drops those and
// the renderer only matches ids of its own pending requests.
export function readReplyEnvelope(
  value: unknown,
): { kind: "response" | "failure"; id: number } | undefined {
  if (!record(value)) return undefined;
  const { kind, id } = value;
  if ((kind !== "response" && kind !== "failure") || !integer(id) || id < 1)
    return undefined;
  return { kind, id };
}
// One logger per connection (no global state, no timers): the first replies are
// logged one by one, then only a running count every `summaryEvery`, so a host
// that keeps sending invalid replies cannot flood the log. Content is never given.
export function invalidReplyLog(limit = 5, summaryEvery = 100) {
  let count = 0;
  return (what: string) => {
    count++;
    if (count <= limit) console.error("Host reply failed validation:", what);
    else if (count % summaryEvery === 0)
      console.error(`Host replies failed validation: ${count} so far`);
  };
}
