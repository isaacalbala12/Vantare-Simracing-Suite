import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type {
  TrackMapUnavailableReason,
  TrackMapViewModel,
} from "../../../widget-types/track-map/track-map-view-model";
import { parseTrackMapEnduranceSettings } from "./track-map-endurance-settings";

const UNAVAILABLE_LABEL: Record<TrackMapUnavailableReason, string> = {
  "no-telemetry": "NO TELEMETRY",
  "unknown-track": "TRACK NOT MAPPED",
};

function classColor(classId?: string): string {
  switch (classId?.toUpperCase()) {
    case "HYPERCAR": case "HC": return "#ff5964";
    case "LMP2": return "#65aaff";
    case "LMP3": return "#ffc857";
    case "GT3": case "LMGT3": return "#50e39a";
    default: return "#e8edf5";
  }
}

export function TrackMapEndurance({ model, settings }: WidgetRendererProps<TrackMapViewModel>) {
  const parsed = parseTrackMapEnduranceSettings(settings);
  const showLabel = parsed.showTrackLabel && model.showTrackLabel;
  const classes = [...new Set(model.markers.map((marker) => marker.classId?.trim() || undefined))];

  return (
    <section
      data-widget-system="vantare-endurance"
      data-widget-renderer="track-map"
      data-status={model.status}
      data-template={parsed.templateId}
      data-availability={model.unavailableReason ?? "available"}
      className="ven-root ven-track-map"
    >
      {model.outlinePath ? (
        <svg
          className="ven-tm-canvas"
          viewBox={model.viewBox}
          role="img"
          aria-label={model.trackLabel ?? "Track map"}
          preserveAspectRatio="xMidYMid meet"
        >
          <path className="ven-tm-outline" d={model.outlinePath} />
          {model.markers.map((marker) => (
            <circle
              key={marker.id}
              className="ven-tm-car"
              cx={marker.x}
              cy={marker.y}
              r={marker.isPlayer ? 7 : 5.5}
              style={{ fill: classColor(marker.classId) }}
              aria-label={`${marker.isPlayer ? "YOU" : marker.id} · ${marker.classId || "Class unavailable"}`}
              data-track-map-car={marker.id}
              data-player={marker.isPlayer ? "true" : undefined}
            />
          ))}
        </svg>
      ) : (
        <div className="ven-tm-empty" data-track-map-empty>
          <span>{UNAVAILABLE_LABEL[model.unavailableReason ?? "unknown-track"]}</span>
        </div>
      )}

      {model.markers.length > 0 ? (
        <div className="ven-tm-legend" aria-label="Car classes">
          {classes.map((classId) => <span key={classId ?? "unknown"}>
            <i style={{ backgroundColor: classColor(classId) }} />{classId ?? "Class unavailable"}
          </span>)}
          {model.markers.some((marker) => marker.isPlayer) ? <span><i className="ven-tm-player-key" />YOU</span> : null}
        </div>
      ) : null}

      {showLabel && model.trackLabel ? (
        <footer className="ven-tm-footer">
          <span className="ven-tm-label">{model.trackLabel}</span>
          {model.synthetic ? (
            <span className="ven-tm-synthetic" data-track-map-synthetic>
              REFERENCE
            </span>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
