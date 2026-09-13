import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { MulticlassRelativeViewModel } from "../../widget-types/multiclass-relative/multiclass-relative-view-model";
import { functionalLabels } from "./labels";

const classLabel = (value: string) => value.toUpperCase().includes("HYPER") ? "HC" : value.slice(0, 3).toUpperCase();

export function MulticlassRelativeFunctional({ model, effects }: WidgetRendererProps<MulticlassRelativeViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const gapText = (gap: number | undefined) =>
    gap === undefined ? "—" : gap === 0 ? "0.0" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)}`;
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;

  return (
    <section
      className="vf-multiclass-relative"
      data-widget-system="vantare-functional"
      data-widget-renderer="multiclass-relative"
      data-status={model.status}
      data-class-mode={model.classMode}
      data-effects={effects}
    >
      <div className="vf-multiclass-relative-list" role="list">
        {model.rows.map((row, index) => (
          <div
            key={`${row.place}-${row.number}`}
            className="vf-multiclass-relative-row"
            data-player={row.isPlayer}
            data-class-divider={model.showClassDivider && index > 0 && model.rows[index - 1].classId !== row.classId ? "true" : undefined}
            role="listitem"
          >
            <span className="vf-multiclass-relative-place">{row.place}</span>
            <span className="vf-multiclass-relative-class" style={{ background: row.classColor }}>{classLabel(row.classId)}</span>
            <span className="vf-multiclass-relative-number">{row.number}</span>
            <span className="vf-multiclass-relative-name">{row.name}</span>
            <span className="vf-multiclass-relative-gap">{gapText(row.gap)}</span>
          </div>
        ))}
      </div>
      {statusText ? <p className="vf-status" role="status">{statusText}</p> : null}
    </section>
  );
}
