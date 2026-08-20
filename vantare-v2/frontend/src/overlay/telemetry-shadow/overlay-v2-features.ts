export const OVERLAY_V2_PLAYER_INSTRUMENTS = "player-instruments" as const;
export const OVERLAY_V2_SESSION = "session" as const;
export const OVERLAY_V2_STANDINGS = "standings" as const;
export const OVERLAY_V2_DELTA = "delta" as const;
export const OVERLAY_V2_RELATIVE = "relative" as const;
export const OVERLAY_V2_FUEL = "fuel" as const;
export const OVERLAY_V2_CONTROLS = "controls" as const;

export type OverlayV2Feature =
  | typeof OVERLAY_V2_PLAYER_INSTRUMENTS
  | typeof OVERLAY_V2_SESSION
  | typeof OVERLAY_V2_STANDINGS
  | typeof OVERLAY_V2_DELTA
  | typeof OVERLAY_V2_RELATIVE
  | typeof OVERLAY_V2_FUEL
  | typeof OVERLAY_V2_CONTROLS;

export const DEFAULT_OVERLAY_V2_FEATURES: readonly OverlayV2Feature[] = Object.freeze([]);

export function hasOverlayV2Feature(
  features: readonly OverlayV2Feature[] | undefined,
  feature: OverlayV2Feature,
): boolean {
  return (features ?? DEFAULT_OVERLAY_V2_FEATURES).includes(feature);
}
