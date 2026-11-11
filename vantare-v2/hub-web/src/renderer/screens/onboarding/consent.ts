import type { PrivacyView } from "../../../contract/generated/contract";
import { type Client, HostFailure } from "../../bridge/client";
export const privacyReady = (value: PrivacyView) =>
  value.crashesDecided &&
  value.usageDecided &&
  !value.protected &&
  !value.cleanupPending &&
  !value.cleanupBusy;
export function canEnterPrivate(error: unknown, value?: PrivacyView): boolean {
  return (
    error instanceof HostFailure &&
    ["io", "protected", "busy"].includes(error.detail.kind) &&
    !!value &&
    !value.protected &&
    !value.crashes &&
    !value.usage &&
    !privacyReady(value)
  );
}
/** Explicit Continue is the consent action. Each write uses the previous durable
 * revision; partial success is published even if the next decision fails. */
export async function saveConsents(
  client: Pick<Client, "request">,
  intent: { crashes: boolean; usage: boolean },
  publish: (value: PrivacyView) => void,
) {
  const reply = await client.request({ method: "privacy.get" });
  if (reply.method !== "privacy.get") throw new HostFailure({ kind: "io" });
  let current = reply.value;
  publish(current);
  if (current.protected) throw new HostFailure({ kind: "protected" });
  try {
    for (const field of ["crashes", "usage"] as const) {
      const decided =
        field === "crashes" ? current.crashesDecided : current.usageDecided;
      if (decided && current[field] === intent[field]) continue;
      const reply = await client.request({
        method: "privacy.update",
        patch: { field, value: intent[field] },
        baseRevision: current.revision,
      });
      if (reply.method !== "privacy.update")
        throw new HostFailure({ kind: "io" });
      current = reply.value;
      publish(current);
    }
  } catch (error) {
    if (
      error instanceof HostFailure &&
      (error.detail.kind === "privacyConflict" ||
        error.detail.kind === "privacyCleanup")
    )
      publish(error.detail.current);
    throw error;
  }
  if (!privacyReady(current))
    throw new HostFailure({ kind: "privacyCleanup", current });
  return current;
}
