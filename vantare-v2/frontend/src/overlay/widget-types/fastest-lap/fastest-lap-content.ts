export type FastestLapContent = { scope: "class" | "session"; durationSeconds: number; showDriver: boolean };
const defaults: FastestLapContent = { scope: "class", durationSeconds: 6, showDriver: true };

export function parseFastestLapContent(input: unknown): FastestLapContent {
  if (input == null) return { ...defaults };
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("fastest-lap content must be an object");
  const value = input as Record<string, unknown>;
  if (value.scope !== undefined && value.scope !== "class" && value.scope !== "session") throw new Error("fastest-lap scope must be class or session");
  if (value.durationSeconds !== undefined && (typeof value.durationSeconds !== "number" || !Number.isInteger(value.durationSeconds) || value.durationSeconds < 3 || value.durationSeconds > 15)) throw new Error("fastest-lap duration must be 3 to 15 seconds");
  if (value.showDriver !== undefined && typeof value.showDriver !== "boolean") throw new Error("fastest-lap showDriver must be boolean");
  return {
    scope: value.scope === "session" ? "session" : defaults.scope,
    durationSeconds: typeof value.durationSeconds === "number" ? value.durationSeconds : defaults.durationSeconds,
    showDriver: typeof value.showDriver === "boolean" ? value.showDriver : defaults.showDriver,
  };
}
