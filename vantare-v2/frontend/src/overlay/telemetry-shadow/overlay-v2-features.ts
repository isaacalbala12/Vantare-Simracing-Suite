export const OVERLAY_V2_PLAYER_INSTRUMENTS = "player-instruments" as const;

export type OverlayV2Feature = typeof OVERLAY_V2_PLAYER_INSTRUMENTS;

export const DEFAULT_OVERLAY_V2_FEATURES: readonly OverlayV2Feature[] = Object.freeze([]);

export function hasOverlayV2Feature(
  features: readonly OverlayV2Feature[] | undefined,
  feature: OverlayV2Feature,
): boolean {
  return (features ?? DEFAULT_OVERLAY_V2_FEATURES).includes(feature);
}
