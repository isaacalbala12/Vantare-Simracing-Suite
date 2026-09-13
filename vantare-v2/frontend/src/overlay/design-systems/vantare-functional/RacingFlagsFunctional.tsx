import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { RacingFlagsViewModel } from "../../widget-types/racing-flags/racing-flags-view-model";

export function RacingFlagsFunctional({ model, effects }: WidgetRendererProps<RacingFlagsViewModel>) {
  if (model.hidden) {
    return (
      <section className="vf-racing-flags vf-racing-flags--hidden" data-widget-system="vantare-functional" data-widget-renderer="racing-flags" data-status={model.status} data-effects={effects} />
    );
  }

  const message = model.message ?? (model.globalFlag ? model.globalFlag.toUpperCase() : "—");

  return (
    <section
      className="vf-racing-flags"
      data-widget-system="vantare-functional"
      data-widget-renderer="racing-flags"
      data-status={model.status}
      data-flag={model.globalFlag ?? "unknown"}
      data-effects={effects}
    >
      <div className="vf-racing-flags-banner">
        <small>{model.globalFlag === "yellow" ? "CAUTION" : "FLAG"}</small>
        <strong>{message}</strong>
      </div>
      {model.showSectorFlags && model.sectorFlags.length > 0 && (
        <div className="vf-racing-flags-sectors" aria-label="Sectors">
          {model.sectorFlags.map((flag, index) => (
            <span key={index} className="vf-racing-flags-sector" data-flag={flag ?? "unknown"}>
              {flag ? flag[0]?.toUpperCase() : "—"}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
