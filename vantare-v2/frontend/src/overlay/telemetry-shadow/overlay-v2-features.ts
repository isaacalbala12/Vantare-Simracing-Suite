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
 * V2 es autoridad por defecto. El rollback diagnóstico pertenece a la
 * generación activa y se destruye con ella; nunca se persiste en window ni en
 * localStorage. La función global sólo dirige la orden a esa generación.
 */
const ROLLBACK_FEATURES: readonly OverlayV2Feature[] = Object.freeze([]);

export type OverlayV2FeaturesGeneration = Readonly<{
  getSnapshot(): readonly OverlayV2Feature[];
  subscribe(listener: () => void): () => void;
  setRollback(enabled: boolean): void;
  dispose(): void;
}>;

let activeGeneration: OverlayV2FeaturesGeneration | undefined;

export function createOverlayV2FeaturesGeneration(): OverlayV2FeaturesGeneration {
  let snapshot: readonly OverlayV2Feature[] = DEFAULT_OVERLAY_V2_FEATURES;
  let disposed = false;
  const listeners = new Set<() => void>();
  const generation: OverlayV2FeaturesGeneration = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setRollback(enabled) {
      if (disposed) return;
      const next = enabled ? ROLLBACK_FEATURES : DEFAULT_OVERLAY_V2_FEATURES;
      if (snapshot === next) return;
      snapshot = next;
      for (const listener of listeners) listener();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vantare:overlay-v2-rollback-changed", {
          detail: Object.freeze({ enabled }),
        }));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      snapshot = DEFAULT_OVERLAY_V2_FEATURES;
      listeners.clear();
      if (activeGeneration === generation) activeGeneration = undefined;
    },
  };
  activeGeneration = generation;
  return generation;
}

export function readDiagnosticOverlayV2Features(): readonly OverlayV2Feature[] {
  return activeGeneration?.getSnapshot() ?? DEFAULT_OVERLAY_V2_FEATURES;
}

export function readOverlayV2Rollback(): boolean {
  return readDiagnosticOverlayV2Features().length === 0;
}

export function writeOverlayV2Rollback(enabled: boolean): void {
  activeGeneration?.setRollback(enabled === true);
}

if (typeof window !== "undefined") {
  window.__vantareSetOverlayV2Rollback ??= writeOverlayV2Rollback;
  window.__vantareGetOverlayV2Rollback ??= readOverlayV2Rollback;
}

declare global {
  interface Window {
    __vantareSetOverlayV2Rollback?: (enabled: boolean) => void;
    __vantareGetOverlayV2Rollback?: () => boolean;
  }
}
