import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import {
  buildTrackOutlinePath,
  createTrackProjection,
  projectTrackPoint,
  resolveTrackGeometry,
  type TrackGeometry,
  type TrackProjection,
  type TrackViewport,
} from "../../track-geometry/track-geometry";
import { REFERENCE_LOOP_ID, TRACK_GEOMETRY_PACK } from "../../track-geometry/track-geometry-pack";
import type { TrackMapContent } from "./track-map-content";

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

export const TRACK_MAP_VIEWPORT: TrackViewport = { width: 320, height: 220, padding: 12 };

const VIEW_BOX = `0 0 ${TRACK_MAP_VIEWPORT.width} ${TRACK_MAP_VIEWPORT.height}`;

const UNAVAILABLE_STATUSES: readonly TelemetrySnapshot["status"][] = [
  "missing",
  "disconnected",
  "error",
];

export function buildTrackMapViewModel(
  snapshot: TelemetrySnapshot,
  content: TrackMapContent,
): TrackMapViewModel {
  if (UNAVAILABLE_STATUSES.includes(snapshot.status)) {
    return unavailable(snapshot, content, "no-telemetry");
  }

  const geometry = resolveTrackGeometry(snapshot.session.trackName, TRACK_GEOMETRY_PACK);
  if (!geometry) {
    return unavailable(snapshot, content, "unknown-track");
  }
  return draw(snapshot, content, geometry) ?? unavailable(snapshot, content, "unknown-track");
}

/**
 * Studio and Workshop need something on screen to position and style the
 * widget before real circuits exist, so authoring falls back to the reference
 * loop. The model still reports it as synthetic, so the renderer can say what
 * it is instead of passing it off as the real circuit.
 */
export function buildTrackMapPreviewViewModel(
  snapshot: TelemetrySnapshot,
  content: TrackMapContent,
): TrackMapViewModel {
  const live = buildTrackMapViewModel(snapshot, content);
  if (live.outlinePath) {
    return live;
  }

  const reference = TRACK_GEOMETRY_PACK.find((geometry) => geometry.id === REFERENCE_LOOP_ID);
  if (!reference) {
    return live;
  }
  return draw(snapshot, content, reference) ?? live;
}

function draw(
  snapshot: TelemetrySnapshot,
  content: TrackMapContent,
  geometry: TrackGeometry,
): TrackMapViewModel | undefined {
  const projection = createTrackProjection(geometry.points, TRACK_MAP_VIEWPORT);
  if (!projection) {
    return undefined;
  }
  return {
    type: "track-map",
    status: snapshot.status,
    statusMessage: snapshot.errorMessage,
    outlinePath: buildTrackOutlinePath(geometry.points, projection),
    trackLabel: geometry.label,
    synthetic: geometry.synthetic,
    viewBox: VIEW_BOX,
    showTrackLabel: content.showTrackLabel,
    markers: buildMarkers(snapshot, projection),
  };
}

function unavailable(
  snapshot: TelemetrySnapshot,
  content: TrackMapContent,
  reason: TrackMapUnavailableReason,
): TrackMapViewModel {
  return {
    type: "track-map",
    status: snapshot.status,
    statusMessage: snapshot.errorMessage,
    synthetic: false,
    unavailableReason: reason,
    viewBox: VIEW_BOX,
    showTrackLabel: content.showTrackLabel,
    markers: [],
  };
}

/**
 * Places every vehicle whose position survived the adapter.
 *
 * The markers reuse the transform that drew the outline rather than computing
 * their own, so a car can never appear off a track that was scaled differently.
 * A vehicle without a usable position is left out entirely: the adapter only
 * emits these fields when the driver vouched for the reading, so an absent
 * position means we do not know where the car is, not that it is at the origin.
 */
function buildMarkers(
  snapshot: TelemetrySnapshot,
  projection: TrackProjection,
): readonly TrackMapMarker[] {
  const markers: TrackMapMarker[] = [];
  for (const row of snapshot.scoring) {
    const x = row.groundPositionXMeters;
    const z = row.groundPositionZMeters;
    if (typeof x !== "number" || typeof z !== "number") {
      continue;
    }
    const projected = projectTrackPoint({ x, z }, projection);
    markers.push({
      id: typeof row.id === "string" ? row.id : `row-${markers.length}`,
      x: projected.x,
      y: projected.y,
      isPlayer: row.isPlayer === true,
    });
  }
  return markers;
}
