import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { CarDamageVisualViewModel } from "../../../widget-types/car-damage-visual/car-damage-visual-view-model";

const health = (damage: number | undefined) => damage === undefined ? "—" : `${Math.max(0, 100 - Math.round(damage * 100))}%`;

export function CarDamageVisualCrystal({ model }: WidgetRendererProps<CarDamageVisualViewModel>) {
  return <section data-widget-system="vantare-crystal" data-widget-renderer="car-damage-visual" data-status={model.status} className="vc-damage-visual"><div className="vc-damage-chassis"><i className="vc-damage-aero-front"/><i className="vc-damage-tire vc-damage-fl"/><i className="vc-damage-tire vc-damage-fr"/><b>{health(model.body)}</b><i className="vc-damage-tire vc-damage-rl"/><i className="vc-damage-tire vc-damage-rr"/><i className="vc-damage-aero-rear"/></div></section>;
}
