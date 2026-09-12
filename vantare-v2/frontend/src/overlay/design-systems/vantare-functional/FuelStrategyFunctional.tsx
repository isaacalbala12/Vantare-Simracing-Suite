import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { FuelStrategyViewModel } from "../../widget-types/fuel-strategy/fuel-strategy-view-model";
import { functionalLabels } from "./labels";

export function FuelStrategyFunctional({ model, effects }: WidgetRendererProps<FuelStrategyViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;

  return (
    <section className="vf-fuel-strategy" data-widget-system="vantare-functional" data-widget-renderer="fuel-strategy" data-status={model.status} data-effects={effects}>
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      <div className="vf-fuel-strategy-body" role="group" aria-label={labels.fuel}>
        <div className="vf-fuel-strategy-primary">
          <span className="vf-fuel-strategy-label">{labels.fuel}</span>
          <b className="vf-fuel-strategy-value">{model.fuelLiters === undefined ? "—" : `${model.fuelLiters.toFixed(1)} L`}</b>
        </div>
        <div className="vf-fuel-strategy-grid">
          <div className="vf-fuel-strategy-slot">
            <span className="vf-fuel-strategy-slot-label">{labels.avg}</span>
            <b className="vf-fuel-strategy-slot-value">{model.avgPerLap === undefined ? "—" : `${model.avgPerLap.toFixed(2)} L`}</b>
          </div>
          {model.showProjection && (
            <>
              <div className="vf-fuel-strategy-slot">
                <span className="vf-fuel-strategy-slot-label">{labels.laps}</span>
                <b className="vf-fuel-strategy-slot-value">{model.lapsRemaining === undefined ? "—" : model.lapsRemaining.toFixed(1)}</b>
              </div>
              <div className="vf-fuel-strategy-slot">
                <span className="vf-fuel-strategy-slot-label">{labels.required}</span>
                <b className="vf-fuel-strategy-slot-value">{model.requiredFuel === undefined ? "—" : `${model.requiredFuel.toFixed(1)} L`}</b>
              </div>
            </>
          )}
        </div>
      </div>
      {model.history.length > 0 && (
        <div className="vf-fuel-strategy-history" role="list" aria-label={labels.history}>
          {model.history.map((row, index) => (
            <div key={index} className="vf-fuel-strategy-row" role="listitem">
              <span className="vf-fuel-strategy-row-lap">{labels.currentLap} {row.lap}</span>
              <b className="vf-fuel-strategy-row-value">{row.consumedLiters.toFixed(2)} L</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
