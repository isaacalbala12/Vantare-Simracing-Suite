import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { CarDamageNumbersViewModel } from "../../../widget-types/car-damage-numbers/car-damage-numbers-view-model";

const p = (value: number | undefined) => value === undefined ? "n/a" : `${Math.round(value * 100)}%`;

export function CarDamageNumbersCrystal({ model }: WidgetRendererProps<CarDamageNumbersViewModel>) {
  const tyre = model.tyres?.length ? Math.max(...model.tyres) : undefined;
  return <section data-widget-system="vantare-crystal" data-widget-renderer="car-damage-numbers" data-status={model.status} className="vc-damage-numbers"><div><span>Aero</span><b>{p(model.aero)}</b></div><div><span>Body</span><b>{p(model.body)}</b></div><div><span>Susp</span><b>{p(model.suspension)}</b></div>{model.showTyres ? <div><span>Tyre</span><b>{p(tyre)}</b></div> : null}</section>;
}
