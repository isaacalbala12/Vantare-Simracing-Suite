import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { MulticlassRelativeViewModel } from "../../../widget-types/multiclass-relative/multiclass-relative-view-model";

const classLabel = (value: string) => value.toUpperCase().includes("HYPER") ? "HC" : value;

export function MulticlassRelativeCrystal({ model }: WidgetRendererProps<MulticlassRelativeViewModel>) {
  return <section data-widget-system="vantare-crystal" data-widget-renderer="multiclass-relative" data-status={model.status} className="vc-multiclass-relative"><header>CLASIFICACIÓN MULTICLASE · Gap respecto a ti</header>{model.rows.length === 0 ? <p role="status">{model.statusMessage ?? "Sin coches para este filtro"}</p> : null}{model.rows.map((row, index) => <article data-class-divider={model.showClassDivider && index > 0 && model.rows[index - 1].classId !== row.classId ? "true" : undefined} className={row.isPlayer ? "is-player" : ""} key={`${row.place}-${row.number}`}><b>{row.place}</b><i style={{ background: row.classColor }}>{classLabel(row.classId)}</i><em>{row.number}</em><strong>{row.name}</strong><span>{row.gap === undefined ? "—" : row.gap === 0 ? "0.0" : `${row.gap > 0 ? "+" : ""}${row.gap.toFixed(1)}`}</span></article>)}</section>;
}
