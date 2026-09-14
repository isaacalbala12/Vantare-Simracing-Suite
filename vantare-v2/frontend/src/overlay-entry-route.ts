export type OverlayRuntime = "desktop" | "obs";

export function selectOverlayRuntime(pathname: string, search: string): OverlayRuntime {
  const params = new URLSearchParams(search);
  return pathname === "/overlay" || params.get("obs") === "1" ? "obs" : "desktop";
}
