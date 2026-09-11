import type { CSSProperties } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { resolveColumnWidthPixels } from "../../widget-types/shared/widget-column";
import { RELATIVE_COLUMN_TEMPLATES } from "../../widget-types/relative/relative-content";
import { resolveRelativeClassColor } from "../../widget-types/relative/relative-renderer-helpers";
import { resolveRelativeCellValue, type RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { functionalLabels } from "./labels";
import vantareMark from "../../../assets/orbit/vantare-mark.png";

const CENTERED = new Set(["position", "class", "carNumber", "gap"]);
const LAP_METRICS = new Set(["bestLap", "lastLap"]);

export function RelativeFunctional({ model, settings }: WidgetRendererProps<RelativeViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const columns = model.columns;
  const hasHeader = settings.showHeader !== false;
  const unavailable = model.status === "disconnected" || model.status === "missing" || model.status === "error";
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;
  const playerPosition = model.rows.find((row) => row.isPlayer)?.position;
  const labelFor = (metricId: string) =>
    metricId === "gap" ? labels.playerGap
      : metricId === "carNumber" ? labels.driverNumber
        : labels[metricId as keyof typeof labels] ?? metricId;

  return (
    <section className="vf-relative" data-widget-system="vantare-functional" data-widget-renderer="relative" data-status={model.status} data-session-header={hasHeader}>
      {hasHeader && <div className="vf-session" title={labels.relative}>
        <span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span>
        <span className="vf-session-context"><span className="vf-session-type" role={model.status === "stale" ? "status" : undefined}>{model.status === "stale" ? labels.stale : labels.relative}</span></span>
        <span className="vf-class">P{playerPosition ?? "—"}</span>
      </div>}
      {statusText && model.status !== "stale" && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {!unavailable && model.rows.length > 0 && (
        <table className="vf-table" aria-label={labels.relative}>
          <colgroup>{columns.map((column) => <col key={column.id} style={{ width: resolveColumnWidthPixels(column, RELATIVE_COLUMN_TEMPLATES.find((template) => template.metricId === column.metricId)?.defaultWidth ?? 60) }} />)}</colgroup>
          <thead><tr>
            {columns.map((column) => <th key={column.id} scope="col" data-metric={column.metricId} title={labelFor(column.metricId)}><span className="vf-column-label">{column.metricId === "class" ? "" : labelFor(column.metricId)}</span></th>)}
          </tr></thead>
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
