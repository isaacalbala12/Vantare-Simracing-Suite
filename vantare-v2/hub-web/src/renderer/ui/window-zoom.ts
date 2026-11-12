import { useSyncExternalStore } from "react";
import { windowZoomLimit } from "../../window-zoom";
import { viewportSize } from "../bridge/viewport";

export const currentZoomLimit = () => {
  const { width, height } = viewportSize();
  return windowZoomLimit(width, height);
};
function subscribe(refresh: () => void) {
  window.addEventListener("resize", refresh);
  return () => window.removeEventListener("resize", refresh);
}
export function useWindowZoomLimit() {
  return useSyncExternalStore(subscribe, currentZoomLimit);
}
