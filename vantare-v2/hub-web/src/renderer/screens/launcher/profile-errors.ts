import { HostFailure } from "../../bridge/client";
import { profileText as text } from "../../i18n/profile-editor";
export function profileFailure(failure: unknown, opening = false): string {
  if (failure instanceof HostFailure)
    switch (failure.detail.kind) {
      case "protected":
        return text.protected;
      case "busy":
        return text.busy;
      case "coreUnavailable":
        return text.coreUnavailable;
    }
  return opening ? text.openFailed : text.failed;
}
