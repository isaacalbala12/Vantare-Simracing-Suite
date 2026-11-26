import { useEffect } from "react";
import { reportMounted } from "../bridge/mounted";

let reported = false;
/**
 * Rendered by the real content: the Shell, the privacy question, the
 * onboarding intro and the account gate as soon as it has a value. The
 * account gate reports in every state (also while checking, logging out or
 * showing an error): a core that answers late or fails must not make the
 * launcher revert a good update. So a Shell that fails on its first mount
 * after a checking account gate is not covered. Its effect only runs once the
 * whole tree around it has committed (ISA-2785). Once per page.
 */
export function HubMounted() {
  useEffect(() => {
    if (reported) return;
    reported = true;
    reportMounted();
  }, []);
  return null;
}
