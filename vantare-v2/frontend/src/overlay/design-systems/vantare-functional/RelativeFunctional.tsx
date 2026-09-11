import type { CSSProperties } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { resolveColumnWidthPixels } from "../../widget-types/shared/widget-column";
import { RELATIVE_COLUMN_TEMPLATES } from "../../widget-types/relative/relative-content";
import { resolveRelativeClassColor } from "../../widget-types/relative/relative-renderer-helpers";
import { resolveRelativeCellValue, type RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { functionalLabels } from "./labels";

const CENTERED = new Set(["position", "class", "carNumber", "gap"]);
const LAP_METRICS = new Set(["bestLap", "lastLap"]);

export function RelativeFunctional({ model, settings }: WidgetRendererProps<RelativeViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const columns = model.columns;
  const unavailable = model.status === "disconnected" || model.status === "missing" || model.status === "error";
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;
  const labelFor = (metricId: string) =>
    metricId === "gap" ? labels.playerGap
      : metricId === "carNumber" ? labels.driverNumber
        : labels[metricId as keyof typeof labels] ?? metricId;

  return (
    // Estructura de la referencia: solo la lista de filas — sin cabecera de
    // marca ni fila de etiquetas de columna.
    <section className="vf-relative" data-widget-system="vantare-functional" data-widget-renderer="relative" data-status={model.status}>
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && <p className="vf-detail">{model.statusMessage}</p>}
      {!unavailable && model.rows.length > 0 && (
        <table className="vf-table" aria-label={labels.relative}>
          <colgroup>{columns.map((column) => <col key={column.id} style={{ width: resolveColumnWidthPixels(column, RELATIVE_COLUMN_TEMPLATES.find((template) => template.metricId === column.metricId)?.defaultWidth ?? 60) }} />)}</colgroup>
          <tbody>{model.rows.map((row) => (
            <tr key={row.id} data-relative-row={row.id} data-player={row.isPlayer || undefined} data-side={row.side}>
              {columns.map((column) => {
                const value = column.metricId === "gap" && row.isPlayer ? "—" : resolveRelativeCellValue(row, column.metricId);
                const align = column.style?.align ?? (CENTERED.has(column.metricId) ? "center" : column.metricId === "driverName" ? "left" : "right");
                return <td key={column.id} data-metric={column.metricId} aria-label={`${labelFor(column.metricId)}: ${value}`} style={{ textAlign: align }}>
                  {column.metricId === "class" ? <span className="vf-class-tick" style={{ background: resolveRelativeClassColor(row.vehicleClass, settings) } as CSSProperties} /> :
                    column.metricId === "driverName" ? <span className="vf-driver"><span className="vf-driver-name" title={value}>{value}</span></span> :
                      <span title={value} className={`vf-cell-value${LAP_METRICS.has(column.metricId) ? " vf-lap-value" : ""}`}>{value}</span>}
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
