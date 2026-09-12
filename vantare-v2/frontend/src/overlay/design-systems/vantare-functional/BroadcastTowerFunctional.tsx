import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { BroadcastTowerViewModel } from "../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { functionalLabels } from "./labels";

export function BroadcastTowerFunctional({ model, effects }: WidgetRendererProps<BroadcastTowerViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const gapText = (gap: number | undefined) =>
    gap === undefined || gap === null ? "—" : `${gap > 0 ? "+" : ""}${gap.toFixed(3)}`;
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;

  return (
    <section
      className="vf-broadcast-tower"
      data-widget-system="vantare-functional"
      data-widget-renderer="broadcast-tower"
      data-status={model.status}
      data-effects={effects}
    >
      <header className="vf-broadcast-tower-header">
        <span className="vf-broadcast-tower-label">{model.sessionLabel}</span>
        <span className="vf-broadcast-tower-lap">
          {labels.currentLap} {model.lap ?? "—"}/{model.totalLaps ?? "—"}
        </span>
      </header>
      {statusText ? (
        <p className="vf-status" role="status">{statusText}</p>
      ) : (
        <div className="vf-broadcast-tower-list" role="list">
          {model.rows.slice(0, model.rowCount).map((row) => (
            <div
              key={`${row.place}-${row.number}`}
              className="vf-broadcast-tower-row"
              data-player={row.isPlayer}
              role="listitem"
            >
              <span className="vf-broadcast-tower-place">{row.place}</span>
              <span
                className="vf-broadcast-tower-number"
                style={{ color: row.brandColor ?? "inherit" }}
              >
                {row.number}
              </span>
              <span className="vf-broadcast-tower-name">{row.name}</span>
              <span className="vf-broadcast-tower-gap">{gapText(row.gap)}</span>
            </div>
          ))}
        </div>
      )}
      {(model.showWeather || model.showSof) && (
        <footer className="vf-broadcast-tower-footer">
          {model.showWeather && model.trackTempC !== undefined && (
            <span className="vf-broadcast-tower-ambient">
              {labels.track} {model.trackTempC}°C
            </span>
          )}
          {model.showSof && (
            <span className="vf-broadcast-tower-sof">
              SOF {model.sof ?? "—"}
            </span>
          )}
        </footer>
      )}
    </section>
  );
}
