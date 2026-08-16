import { useEffect } from "react";
import { applyHubZoom, clearHubZoom, resolveHubZoomFactor } from "./hub-zoom";

export function useHubResponsiveZoom(): void {
  useEffect(() => {
    const host = document.documentElement;
    const apply = () => applyHubZoom(host, resolveHubZoomFactor(window.innerHeight));
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      clearHubZoom(host);
    };
  }, []);
}
