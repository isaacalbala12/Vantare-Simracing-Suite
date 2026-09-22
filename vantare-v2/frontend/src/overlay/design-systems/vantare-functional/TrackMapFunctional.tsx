import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { TrackMapViewModel } from "../../widget-types/track-map/track-map-view-model";
import { resolveRelativeClassColor } from "../../widget-types/relative/relative-renderer-helpers";
import { useI18n } from "../../../i18n/I18nProvider";
import { functionalLabels } from "./labels";

export function TrackMapFunctional({ model, settings, effects }: WidgetRendererProps<TrackMapViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
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
        <svg className="vf-track-map-canvas" viewBox={model.viewBox} role="img" aria-label={model.trackLabel ?? labels.trackMap} preserveAspectRatio="xMidYMid meet">
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
              aria-label={`${marker.isPlayer ? labels.you : marker.id} · ${marker.classId || labels.classUnavailable}`}
            />
          ))}
        </svg>
      ) : (
        <div className="vf-track-map-empty" data-track-map-empty>
          <span>{model.unavailableReason === "no-telemetry" ? labels.noTelemetry : labels.trackNotMapped}</span>
        </div>
      )}
      {model.trackLabel && (
        <footer className="vf-track-map-footer">
          <span className="vf-track-map-label">{model.trackLabel}</span>
          {model.synthetic ? <span className="vf-track-map-synthetic" data-track-map-synthetic>{labels.reference}</span> : null}
        </footer>
      )}
    </section>
  );
}
