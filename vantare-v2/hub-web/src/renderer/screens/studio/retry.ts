import type { Request } from "../../../contract/generated/contract";

export function canRetryStudio(request: Request) {
  if (
    !["studio.visibility", "studio.instance", "studio.track"].includes(
      request.method,
    )
  )
    return false;
  // set_threshold sorts/compacts the array. Replaying an index could edit a
  // different threshold, even with a fresh CAS revision.
  return !(
    request.method === "studio.instance" &&
    request.patch.field === "settings" &&
    request.patch.value.kind === "session-alerts" &&
    request.patch.value.threshold !== undefined
  );
}
