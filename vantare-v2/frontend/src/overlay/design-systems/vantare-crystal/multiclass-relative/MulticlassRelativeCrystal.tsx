import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { MulticlassRelativeViewModel } from "../../../widget-types/multiclass-relative/multiclass-relative-view-model";

export function MulticlassRelativeCrystal({ model }: WidgetRendererProps<MulticlassRelativeViewModel>) {
  return <section data-widget-system="vantare-crystal" data-widget-renderer="multiclass-relative" data-status={model.status} className="vc-multiclass-relative">{model.rows.map((row) => <article className={row.isPlayer ? "is-player" : ""} key={`${row.place}-${row.number}`}><b>{row.place}</b><i style={{ background: row.classColor }}>{row.classId}</i><em>{row.number}</em><strong>{row.name}</strong><span>{row.gap === undefined ? "—" : row.gap === 0 ? "0.0" : `${row.gap > 0 ? "+" : ""}${row.gap.toFixed(1)}`}</span></article>)}</section>;
}
