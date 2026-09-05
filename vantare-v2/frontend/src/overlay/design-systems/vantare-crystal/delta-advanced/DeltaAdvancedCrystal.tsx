import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { deltaAdvancedReferenceLabel, type DeltaAdvancedViewModel } from "../../../widget-types/delta-advanced/delta-advanced-view-model";

const value = (input: number | undefined) => input === undefined ? "Sin dato" : `${input >= 0 ? "+" : ""}${input.toFixed(3)}`;

export function DeltaAdvancedCrystal({ model }: WidgetRendererProps<DeltaAdvancedViewModel>) {
  const reference = deltaAdvancedReferenceLabel(model.reference);
  const cells = [["b", "Delta", model.best], ["s", "Sector", model.sector], ["t", "Teórica", model.theoretical], ["l", "Última", model.last]] as const;
  const visible = cells.filter(([, , item]) => model.showUnavailableFields || item !== undefined);
  return <section data-widget-system="vantare-crystal" data-widget-renderer="delta-advanced" data-status={model.status} className="vc-delta-advanced">{visible.length === 0 ? <p role="status">Sin delta disponible</p> : null}{visible.map(([tone, tag, item]) => <div data-tone={tone} key={tag}><i title={tone === "b" ? model.reference ?? "Referencia no disponible" : tag}>{tag}</i>{tone === "b" ? <small>{reference}</small> : null}<b>{value(item)}</b></div>)}</section>;
}
