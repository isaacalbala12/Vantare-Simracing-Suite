import type { OverlayFrameV2, OverlayQValue, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import {
  buildTrackOutlinePath,
  createTrackProjection,
  resolveTrackGeometry,
  type TrackGeometry,
  type TrackProjection,
  type TrackViewport,
} from "../../track-geometry/track-geometry";
import { REFERENCE_LOOP_ID, TRACK_GEOMETRY_PACK } from "../../track-geometry/track-geometry-pack";
import type { TrackMapContent } from "./track-map-content";
import type { TrackMapMarker, TrackMapUnavailableReason, TrackMapViewModel } from "./track-map-view-model";

export const TRACK_MAP_VIEWPORT_V2: TrackViewport = { width: 320, height: 220, padding: 12 };
const VIEW_BOX = `0 0 ${TRACK_MAP_VIEWPORT_V2.width} ${TRACK_MAP_VIEWPORT_V2.height}`;

/**
 * Track-map view model over the Overlay v2 contract.
 *
 * Dibuja el trazado desde `frame.session.track` y el pack estatico igual que
 * el v1. Los marcadores requieren posicion por coche (x/z en el plano del
 * circuito): OverlayFrameV2 NO publica `groundPosition` ni `lapDistance` por
 * vehiculo (falta seccion `spatial` por coche). Se dejan vacios y se declara
 * el gap para que la futura ampliacion del frame los alimente sin cambiar el
 * VM.
 */
export function buildTrackMapViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: TrackMapContent,
): TrackMapViewModel {
  if (source.state === "error" || source.state === "stopped" || source.state === "missing") {
    const reason: TrackMapUnavailableReason = "no-telemetry";
    return unavailable(mapStatus(source.state), source.reason || undefined, content, reason);
  }

  const trackName = displayedText(frame.session.track);
  const geometry = resolveTrackGeometry(trackName, TRACK_GEOMETRY_PACK);
  if (!geometry) {
    return unavailable(mapStatus(source.state), source.reason || undefined, content, "unknown-track");
  }
  return draw(frame, source, content, geometry) ?? unavailable(mapStatus(source.state), source.reason || undefined, content, "unknown-track");
}

export function buildTrackMapPreviewViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: TrackMapContent,
): TrackMapViewModel {
  const live = buildTrackMapViewModelV2(frame, source, content);
  if (live.outlinePath) return live;
  const reference = TRACK_GEOMETRY_PACK.find((g) => g.id === REFERENCE_LOOP_ID);
  if (!reference) return live;
  return draw(frame, source, content, reference) ?? live;
}

export function trackMapDisplayedValues(model: TrackMapViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    trackLabel: model.trackLabel ?? "",
    markerCount: String(model.markers.length),
    synthetic: String(model.synthetic),
  });
}

/** Campos sin senal canonica; declarados. */
export const OVERLAY_V2_TRACKMAP_DECLARED_GAPS: readonly string[] = Object.freeze([
  "markers",
]);

function draw(
  _frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: TrackMapContent,
  geometry: TrackGeometry,
): TrackMapViewModel | undefined {
  const projection = createTrackProjection(geometry.points, TRACK_MAP_VIEWPORT_V2);
  if (!projection) return undefined;
  return {
    type: "track-map",
    status: mapStatus(source.state),
    statusMessage: source.reason || undefined,
    outlinePath: buildTrackOutlinePath(geometry.points, projection),
    trackLabel: geometry.label,
    synthetic: geometry.synthetic,
    viewBox: VIEW_BOX,
    showTrackLabel: content.showTrackLabel,
    markers: buildMarkersV2(projection),
  };
}

function unavailable(
  status: TrackMapViewModel["status"],
  statusMessage: string | undefined,
  content: TrackMapContent,
  reason: TrackMapUnavailableReason,
): TrackMapViewModel {
  return {
    type: "track-map",
    status,
    statusMessage,
    synthetic: false,
    unavailableReason: reason,
    viewBox: VIEW_BOX,
    showTrackLabel: content.showTrackLabel,
    markers: [],
  };
}

/**
 * Sin posiciones por coche en el frame v2, no hay marcadores que colocar.
 * Mantiene la transformacion del outline para futura compatibilidad.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildMarkersV2(_projection: TrackProjection): readonly TrackMapMarker[] {
  return [];
}

function mapStatus(state: string): TrackMapViewModel["status"] {
  switch (state) {
    case "live":
      return "ready";
    case "stale":
      return "stale";
    case "error":
      return "error";
    case "stopped":
      return "disconnected";
    default:
      return "missing";
  }
}

function displayedText(value: OverlayQValue<string>): string | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? undefined;
}
