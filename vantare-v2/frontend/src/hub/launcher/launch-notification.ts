import type { LastResult } from "./chain-store";

export function notifyLaunchResult(profileId: string, result: LastResult): boolean {
  if (typeof document === "undefined" || !document.hidden) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const label = result === "success" ? "completado" : result === "partial" ? "con fallos" : "fallido";
  try {
    new Notification(`Launcher: ${profileId}`, { body: `Lanzamiento ${label}.` });
    return true;
  } catch {
    return false;
  }
}
