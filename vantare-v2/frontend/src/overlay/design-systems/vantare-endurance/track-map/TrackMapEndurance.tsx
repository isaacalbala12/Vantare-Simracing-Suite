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

export function TrackMapEndurance({ model, settings }: WidgetRendererProps<TrackMapViewModel>) {
  const parsed = parseTrackMapEnduranceSettings(settings);
  const showLabel = parsed.showTrackLabel && model.showTrackLabel;

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
        </svg>
      ) : (
        <div className="ven-tm-empty" data-track-map-empty>
          <span>{UNAVAILABLE_LABEL[model.unavailableReason ?? "unknown-track"]}</span>
        </div>
      )}

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
