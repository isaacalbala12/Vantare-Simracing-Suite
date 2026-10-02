export type FastestLapContent = { showPersonal: boolean; showClass: boolean; durationSeconds: number; showDriver: boolean };
const defaults: FastestLapContent = { showPersonal: true, showClass: true, durationSeconds: 6, showDriver: true };

export function parseFastestLapContent(input: unknown): FastestLapContent {
  if (input == null) return { ...defaults };
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("fastest-lap content must be an object");
  const value = input as Record<string, unknown>;
  // Normalize the earlier draft's class/session selector to the approved pair
  // of alerts. No session-wide scope remains in the returned contract.
  if (value.scope !== undefined && value.scope !== "class" && value.scope !== "session") throw new Error("unknown legacy fastest-lap scope");
  if (value.showPersonal !== undefined && typeof value.showPersonal !== "boolean") throw new Error("fastest-lap showPersonal must be boolean");
  if (value.showClass !== undefined && typeof value.showClass !== "boolean") throw new Error("fastest-lap showClass must be boolean");
  if (value.durationSeconds !== undefined && (typeof value.durationSeconds !== "number" || !Number.isInteger(value.durationSeconds) || value.durationSeconds < 3 || value.durationSeconds > 15)) throw new Error("fastest-lap duration must be 3 to 15 seconds");
  if (value.showDriver !== undefined && typeof value.showDriver !== "boolean") throw new Error("fastest-lap showDriver must be boolean");
  return {
    showPersonal: typeof value.showPersonal === "boolean" ? value.showPersonal : defaults.showPersonal,
    showClass: typeof value.showClass === "boolean" ? value.showClass : defaults.showClass,
    durationSeconds: typeof value.durationSeconds === "number" ? value.durationSeconds : defaults.durationSeconds,
    showDriver: typeof value.showDriver === "boolean" ? value.showDriver : defaults.showDriver,
  };
}
