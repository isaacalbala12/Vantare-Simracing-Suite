import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { FuelStrategyViewModel } from "../../../widget-types/fuel-strategy/fuel-strategy-view-model";

const number = (value: number | undefined, suffix = "") => value === undefined ? "—" : `${value.toFixed(1)}${suffix}`;

export function FuelStrategyCrystal({ model }: WidgetRendererProps<FuelStrategyViewModel>) {
  return (
    <section data-widget-system="vantare-crystal" data-widget-renderer="fuel-strategy" data-status={model.status} className="vc-fuel-strategy">
      <div className="vc-fuel-main">
        <div className="vc-fuel-heading"><strong>COMBUSTIBLE</strong><b>{number(model.fuelLiters, " L")}</b></div>
        <div className="vc-fuel-bar"><i style={{ width: `${model.fuelPercent ?? 0}%` }} /></div>
        <div className="vc-fuel-stats">
          <span><b>{number(model.avgPerLap, " L")}</b><small>CONSUMO MEDIO</small></span>
          <span><b>{number(model.lapsRemaining)}</b><small>VUELTAS REST.</small></span>
          <span><b className="vc-fuel-required">{number(model.requiredFuel, " L")}</b><small>REFUEL REQ.</small></span>
        </div>
        <footer><span>ESTIMACIÓN META:</span><b>{model.requiredFuel === undefined ? "—" : `${number(model.requiredFuel, " L")} REQUERIDO`}</b></footer>
      </div>
      <aside>
        <header>HISTORIAL RECIENTE</header>
        {[...model.history].reverse().map((row) => <div key={row.lap}><span>Vuelta #{row.lap}</span><b>{row.consumedLiters.toFixed(1)} L</b></div>)}
        <em>{model.history.length > 0 ? "Ritmo derivado de vueltas completadas" : "Historial no disponible"}</em>
      </aside>
    </section>
  );
}
