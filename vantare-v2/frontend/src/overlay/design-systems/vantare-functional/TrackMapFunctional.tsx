import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { TrackMapUnavailableReason, TrackMapViewModel } from "../../widget-types/track-map/track-map-view-model";
import { resolveRelativeClassColor } from "../../widget-types/relative/relative-renderer-helpers";

const UNAVAILABLE_LABEL: Record<TrackMapUnavailableReason, string> = {
  "no-telemetry": "NO TELEMETRY",
  "unknown-track": "TRACK NOT MAPPED",
};

export function TrackMapFunctional({ model, settings, effects }: WidgetRendererProps<TrackMapViewModel>) {
  return (
    <section
      className="vf-track-map"
      data-widget-system="vantare-functional"
      data-widget-renderer="track-map"
      data-status={model.status}
      data-availability={model.unavailableReason ?? "available"}
      data-effects={effects}
    >
      {model.outlinePath ? (
        <svg className="vf-track-map-canvas" viewBox={model.viewBox} role="img" aria-label={model.trackLabel ?? "Track map"} preserveAspectRatio="xMidYMid meet">
          <path className="vf-track-map-outline" d={model.outlinePath} />
          {model.markers.map((marker) => (
            <circle
              key={marker.id}
              className="vf-track-map-car"
              cx={marker.x}
              cy={marker.y}
              r={marker.isPlayer ? 5.5 : 4}
              style={{ fill: marker.isPlayer ? "var(--vf-accent)" : resolveRelativeClassColor(marker.classId, settings) }}
              data-player={marker.isPlayer ? "true" : undefined}
              aria-label={`${marker.isPlayer ? "YOU" : marker.id} · ${marker.classId || "Class unavailable"}`}
            />
          ))}
        </svg>
      ) : (
        <div className="vf-track-map-empty" data-track-map-empty>
          <span>{UNAVAILABLE_LABEL[model.unavailableReason ?? "unknown-track"]}</span>
        </div>
      )}
      {model.trackLabel && (
        <footer className="vf-track-map-footer">
          <span className="vf-track-map-label">{model.trackLabel}</span>
          {model.synthetic ? <span className="vf-track-map-synthetic" data-track-map-synthetic>REFERENCE</span> : null}
        </footer>
      )}
    </section>
  );
}
