import { useSyncExternalStore } from "react";
import { windowZoomLimit } from "../../window-zoom";

// The Hub is frameless: outer size is the DIP client size and is independent
// of Chromium's page zoom. innerWidth would feed the zoom back into its limit.
export const currentZoomLimit = () =>
  windowZoomLimit(window.outerWidth, window.outerHeight);
function subscribe(refresh: () => void) {
  window.addEventListener("resize", refresh);
  return () => window.removeEventListener("resize", refresh);
}
export function useWindowZoomLimit() {
  return useSyncExternalStore(subscribe, currentZoomLimit);
}
