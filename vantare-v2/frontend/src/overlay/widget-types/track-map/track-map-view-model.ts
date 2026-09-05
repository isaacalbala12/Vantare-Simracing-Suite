import type { WidgetViewModelBase } from "../../core/widget-definition";

/**
 * Why the outline is not drawn.
 *
 * `unknown-track` is the honest answer whenever the active circuit cannot be
 * resolved to exactly one shipped geometry, and it is deliberately not
 * distinguishable from "we have no pack yet": in both cases the only correct
 * behaviour is to draw nothing.
 */
export type TrackMapUnavailableReason = "no-telemetry" | "unknown-track";

export type TrackMapMarker = Readonly<{
  id: string;
  x: number;
  y: number;
  isPlayer: boolean;
}>;

export type TrackMapViewModel = WidgetViewModelBase & {
  type: "track-map";
  outlinePath?: string;
  trackLabel?: string;
  /** True when the drawn outline is a placeholder rather than a real circuit. */
  synthetic: boolean;
  unavailableReason?: TrackMapUnavailableReason;
  viewBox: string;
  showTrackLabel: boolean;
  markers: readonly TrackMapMarker[];
};
