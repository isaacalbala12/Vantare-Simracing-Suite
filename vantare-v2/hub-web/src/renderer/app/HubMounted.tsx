import { useEffect } from "react";
import { reportMounted } from "../bridge/mounted";

let reported = false;
/**
 * Rendered by the real content: the Shell or a gate that asks the user
 * something, never a loading or error screen. Its effect only runs once the
 * whole tree around it has committed, so a content that fails to mount never
 * reports and the launcher reverts the update (ISA-2785). Once per page.
 */
export function HubMounted() {
  useEffect(() => {
    if (reported) return;
    reported = true;
    reportMounted();
  }, []);
  return null;
}
