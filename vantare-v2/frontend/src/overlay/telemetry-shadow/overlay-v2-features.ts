export const OVERLAY_V2_PLAYER_INSTRUMENTS = "player-instruments" as const;
export const OVERLAY_V2_SESSION = "session" as const;
export const OVERLAY_V2_STANDINGS = "standings" as const;
export const OVERLAY_V2_DELTA = "delta" as const;
export const OVERLAY_V2_RELATIVE = "relative" as const;
export const OVERLAY_V2_FUEL = "fuel" as const;
export const OVERLAY_V2_CONTROLS = "controls" as const;
export const OVERLAY_V2_DAMAGE = "damage" as const;
export const OVERLAY_V2_WEATHER = "weather" as const;

export type OverlayV2Feature =
  | typeof OVERLAY_V2_PLAYER_INSTRUMENTS
  | typeof OVERLAY_V2_SESSION
  | typeof OVERLAY_V2_STANDINGS
  | typeof OVERLAY_V2_DELTA
  | typeof OVERLAY_V2_RELATIVE
  | typeof OVERLAY_V2_FUEL
  | typeof OVERLAY_V2_CONTROLS
  | typeof OVERLAY_V2_DAMAGE
  | typeof OVERLAY_V2_WEATHER;

export const DEFAULT_OVERLAY_V2_FEATURES: readonly OverlayV2Feature[] = Object.freeze([
  OVERLAY_V2_PLAYER_INSTRUMENTS,
  OVERLAY_V2_SESSION,
  OVERLAY_V2_STANDINGS,
  OVERLAY_V2_DELTA,
  OVERLAY_V2_RELATIVE,
  OVERLAY_V2_FUEL,
  OVERLAY_V2_CONTROLS,
  OVERLAY_V2_DAMAGE,
  OVERLAY_V2_WEATHER,
]);

const ALL_FEATURES = new Set<string>(DEFAULT_OVERLAY_V2_FEATURES);

export function hasOverlayV2Feature(
  features: readonly OverlayV2Feature[] | undefined,
  feature: OverlayV2Feature,
): boolean {
  return (features ?? DEFAULT_OVERLAY_V2_FEATURES).includes(feature);
}

export function parseOverlayV2Features(input: unknown): OverlayV2Feature[] {
  if (!Array.isArray(input)) return [];
  const out: OverlayV2Feature[] = [];
  for (const value of input) {
    if (typeof value === "string" && ALL_FEATURES.has(value)) out.push(value as OverlayV2Feature);
  }
  return out;
}

/**
 * Compatibilidad transitoria con las surfaces reservadas a #936.
 *
 * V2 es autoridad por defecto y por eso se devuelve el catálogo completo.
 * La única excepción es el rollback diagnóstico de esta ventana, que devuelve
 * una lista vacía para detener la suscripción durante la inspección. No se lee
 * ni escribe localStorage y recargar la ventana siempre restaura V2.
 */
export function readDiagnosticOverlayV2Features(): OverlayV2Feature[] {
  return readOverlayV2Rollback() ? [] : [...DEFAULT_OVERLAY_V2_FEATURES];
}

export function readOverlayV2Rollback(): boolean {
  return typeof window !== "undefined" && window.__vantareOverlayV2Rollback === true;
}

export function writeOverlayV2Rollback(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.__vantareOverlayV2Rollback = enabled === true;
  const detail = Object.freeze({ enabled: window.__vantareOverlayV2Rollback });
  window.dispatchEvent(new CustomEvent("vantare:overlay-v2-rollback-changed", { detail }));
}

if (typeof window !== "undefined") {
  window.__vantareSetOverlayV2Rollback ??= writeOverlayV2Rollback;
  window.__vantareGetOverlayV2Rollback ??= readOverlayV2Rollback;
}

declare global {
  interface Window {
    __vantareOverlayV2Rollback?: boolean;
    __vantareSetOverlayV2Rollback?: (enabled: boolean) => void;
    __vantareGetOverlayV2Rollback?: () => boolean;
  }
}
