import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { FuelStrategyViewModel } from "../../widget-types/fuel-strategy/fuel-strategy-view-model";
import { functionalLabels } from "./labels";

// Fuel Strategy en Eficiencia: misma composición que el diseño de referencia
// (panel principal con nivel + consumo + proyección, panel de historial a la
// derecha) traducida a los tokens funcionales — esquinas vivas, micro-labels
// en mayúsculas y números tabulares.
export function FuelStrategyFunctional({ model, effects }: WidgetRendererProps<FuelStrategyViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const source = model.source ?? "fuel";
  const statusText = model.status !== "ready"
    ? labels[model.status]
    : model.sourceUnavailable
      ? labels.virtualEnergyUnavailable
      : undefined;
  const liters = (value: number | undefined, decimals = 1) =>
    value === undefined ? "—" : `${value.toFixed(decimals)} L`;
  const percent = model.fuelPercent === undefined
    ? undefined
    : Math.max(0, Math.min(100, model.fuelPercent));

  return (
    <section className="vf-fuel-strategy" data-widget-system="vantare-functional" data-widget-renderer="fuel-strategy" data-status={model.status} data-source={source} data-effects={effects}>
      {statusText ? (
        <p className="vf-status" role="status">{statusText}</p>
      ) : (
        <>
          <div className="vf-fuel-main">
            <div className="vf-fuel-head">
              <span className="vf-fuel-label">{source === "virtual-energy" ? labels.virtualEnergy : labels.fuel}</span>
              <b className="vf-fuel-value">{liters(model.fuelLiters)}</b>
            </div>
            <div className="vf-fuel-bar" role="presentation">
              <i style={{ width: `${percent ?? 0}%` }} />
            </div>
            <div className="vf-fuel-stats">
              <span className="vf-fuel-stat">
                <em className="vf-fuel-stat-label">{labels.avg}</em>
                <b className="vf-fuel-stat-value">{liters(model.avgPerLap, 2)}</b>
              </span>
              {model.showProjection && (
                <>
                  <span className="vf-fuel-stat">
                    <em className="vf-fuel-stat-label">{labels.laps}</em>
                    <b className="vf-fuel-stat-value">{model.lapsRemaining === undefined ? "—" : model.lapsRemaining.toFixed(1)}</b>
                  </span>
                  <span className="vf-fuel-stat">
                    <em className="vf-fuel-stat-label">{labels.required}</em>
                    <b className="vf-fuel-stat-value vf-fuel-stat-value--req">{liters(model.requiredFuel)}</b>
                  </span>
                </>
              )}
            </div>
            {model.showProjection && (
              <footer className="vf-fuel-foot">
                <span>{labels.estFinish}:</span>
                <b>{model.requiredFuel === undefined ? "—" : `${liters(model.requiredFuel)} ${labels.required}`}</b>
              </footer>
            )}
            {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
          </div>
          {model.history.length > 0 && (
            <aside className="vf-fuel-history">
              <span className="vf-fuel-history-title">{labels.history}</span>
              <div className="vf-fuel-history-list" role="list">
                {[...model.history].reverse().map((row) => (
                  <div key={row.lap} className="vf-fuel-history-row" role="listitem">
                    <span>{labels.currentLap} {row.lap}</span>
                    <b>{liters(row.consumedLiters)}</b>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </>
      )}
    </section>
  );
}
