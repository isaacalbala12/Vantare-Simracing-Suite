import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { DeltaAdvancedViewModel } from "../../../widget-types/delta-advanced/delta-advanced-view-model";

const value = (input: number | undefined) => input === undefined ? "--.---" : `${input >= 0 ? "+" : ""}${input.toFixed(3)}`;

export function DeltaAdvancedCrystal({ model }: WidgetRendererProps<DeltaAdvancedViewModel>) {
  const cells = [["b", "B", model.best], ["s", "S", model.sector], ["t", "T", model.theoretical], ["l", "L", model.last]] as const;
  return <section data-widget-system="vantare-crystal" data-widget-renderer="delta-advanced" data-status={model.status} className="vc-delta-advanced">{cells.map(([tone, tag, item]) => <div key={tag}><i data-tone={tone}>{tag}</i><b>{value(item)}</b></div>)}</section>;
}
