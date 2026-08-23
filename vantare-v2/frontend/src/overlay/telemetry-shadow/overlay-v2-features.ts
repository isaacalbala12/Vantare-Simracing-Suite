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

export const DEFAULT_OVERLAY_V2_FEATURES: readonly OverlayV2Feature[] = Object.freeze([]);

export function hasOverlayV2Feature(
  features: readonly OverlayV2Feature[] | undefined,
  feature: OverlayV2Feature,
): boolean {
  return (features ?? DEFAULT_OVERLAY_V2_FEATURES).includes(feature);
}

/**
 * Flag diagnóstico mínimo para el gate F9 (ISA-777).
 *
 * Hoy `overlayV2Features` no viene del perfil ni de un setting persistido:
 * es `WidgetRuntimeInput.overlayV2Features` que `CompositeApp`/`ObsOverlayApp`
 * inyectan al `RuntimeWidgetFrame`. Para el gate sin tocar backend, Fable
 * puede encender features en un overlay vivo sin recompilar:
 *
 *  1) Consola (preferido, memoria): `__vantareSetOverlayV2Features(["standings","relative","delta","fuel","player-instruments","controls","session"])`
 *     y `__vantareGetOverlayV2Features()` para verificar. El cambio dispara un
 *     evento `vantare:overlay-v2-features-changed` que los runtimes escuchan.
 *  2) Persistido: `localStorage.setItem("vantare:overlay-v2-features", JSON.stringify([...]))`.
 *     Se lee al montar y al recibir el evento anterior.
 *
 * `DEFAULT_OVERLAY_V2_FEATURES` sigue vacío (off) para no cambiar producción.
 */
export const OVERLAY_V2_DIAGNOSTIC_STORAGE_KEY = "vantare:overlay-v2-features" as const;

const ALL_FEATURES = new Set<string>([
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

export function parseOverlayV2Features(input: unknown): OverlayV2Feature[] {
  if (!Array.isArray(input)) return [];
  const out: OverlayV2Feature[] = [];
  for (const value of input) {
    if (typeof value === "string" && ALL_FEATURES.has(value)) out.push(value as OverlayV2Feature);
  }
  return out;
}

export function readDiagnosticOverlayV2Features(): OverlayV2Feature[] {
  if (typeof window !== "undefined") {
    const w = window as unknown as Record<string, unknown>;
    const winFlag = w.__vantareOverlayV2Features;
    if (Array.isArray(winFlag)) {
      const parsed = parseOverlayV2Features(winFlag);
      if (parsed.length > 0 || winFlag.length === 0) return parsed;
    }
    try {
      const raw = window.localStorage?.getItem(OVERLAY_V2_DIAGNOSTIC_STORAGE_KEY);
      if (raw) return parseOverlayV2Features(JSON.parse(raw));
    } catch {
      // ignore storage parse errors
    }
  }
  return [...DEFAULT_OVERLAY_V2_FEATURES];
}

export function writeDiagnosticOverlayV2Features(features: readonly OverlayV2Feature[]): void {
  if (typeof window === "undefined") return;
  const parsed = parseOverlayV2Features(features);
  const w = window as unknown as Record<string, unknown>;
  w.__vantareOverlayV2Features = [...parsed];
  try {
    window.localStorage?.setItem(OVERLAY_V2_DIAGNOSTIC_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore quota
  }
  try {
    window.dispatchEvent(new CustomEvent("vantare:overlay-v2-features-changed", { detail: parsed }));
  } catch {
    // ignore dispatch errors
  }
}

if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  if (typeof w.__vantareSetOverlayV2Features !== "function") {
    w.__vantareSetOverlayV2Features = (features: unknown) => writeDiagnosticOverlayV2Features(features as OverlayV2Feature[]);
  }
  if (typeof w.__vantareGetOverlayV2Features !== "function") {
    w.__vantareGetOverlayV2Features = () => readDiagnosticOverlayV2Features();
  }
}

declare global {
  interface Window {
    __vantareOverlayV2Features?: OverlayV2Feature[];
    __vantareSetOverlayV2Features?: (features: readonly OverlayV2Feature[] | unknown) => void;
    __vantareGetOverlayV2Features?: () => OverlayV2Feature[];
  }
}
