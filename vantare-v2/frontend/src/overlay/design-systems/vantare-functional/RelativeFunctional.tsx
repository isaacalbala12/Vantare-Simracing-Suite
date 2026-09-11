import type { CSSProperties } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { resolveColumnWidthPixels } from "../../widget-types/shared/widget-column";
import { RELATIVE_COLUMN_TEMPLATES } from "../../widget-types/relative/relative-content";
import { resolveRelativeClassColor } from "../../widget-types/relative/relative-renderer-helpers";
import { resolveRelativeCellValue, type RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { functionalLabels } from "./labels";
import { resolveFunctionalFooterSlots } from "./footer-slots";

const CENTERED = new Set(["position", "class", "carNumber", "gap"]);
const LAP_METRICS = new Set(["bestLap", "lastLap"]);

const SLOT_ROW_PX = 14;
const SLOT_PAD_PX = 15;
const SLOT_GAP_PX = 14;
const RELATIVE_ROW_PX = 26;
const slotItemWidth = (label: string, value: string) => label.length * 5.5 + value.length * 7.5 + 12;

export function RelativeFunctional({ model, settings, layout }: WidgetRendererProps<RelativeViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const columns = model.columns;
  const unavailable = model.status === "disconnected" || model.status === "missing" || model.status === "error";
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;
  const hasMeta = Boolean(model.trackText || model.playerBadgeText);
  const footerSlots = Array.isArray(settings.footerSlots) ? (settings.footerSlots as unknown[]).filter((s): s is string => typeof s === "string") : [];
  const slots = footerSlots.length > 0 ? resolveFunctionalFooterSlots(model, footerSlots, labels) : [];
  const hasFooter = slots.length === 0 && Boolean(model.sessionLabel || model.remainingText || model.ambientTempText || model.trackTempText || model.windText);
  const labelFor = (metricId: string) =>
    metricId === "gap" ? labels.playerGap
      : metricId === "carNumber" ? labels.driverNumber
        : labels[metricId as keyof typeof labels] ?? metricId;

  // Mismo presupuesto que standings: el pie nunca se corta y la tabla cede
  // en filas completas. Sin layout no se recorta nada.
  const innerWidth = Math.max(80, (layout?.w ?? 0) - 24);
  const slotsTotal = slots.reduce((sum, slot) => sum + slotItemWidth(slot.label, slot.value), 0) + Math.max(0, slots.length - 1) * SLOT_GAP_PX;
  const slotRows = slots.length > 0 ? Math.max(1, Math.ceil(slotsTotal / innerWidth)) : 0;
  const slotsHeight = slotRows > 0 ? SLOT_PAD_PX + slotRows * SLOT_ROW_PX : 0;
  const tableSpace = layout?.h === undefined
    ? Number.POSITIVE_INFINITY
    : layout.h - (hasMeta ? 30 : 0) - slotsHeight - (slots.length === 0 && hasFooter ? 30 : 0);
  const rowsFit = Math.max(0, Math.floor(tableSpace / RELATIVE_ROW_PX));
  const visibleRows = Number.isFinite(tableSpace) ? model.rows.slice(0, rowsFit) : model.rows;

  return (
    // Estructura de la referencia: barra de meta arriba (pista + posición del
    // jugador), lista de filas, barra inferior (sesión/reloj + ambiente). Cada
    // hueco solo se pinta cuando la fuente entrega el dato.
    <section className="vf-relative" data-widget-system="vantare-functional" data-widget-renderer="relative" data-status={model.status}>
      {hasMeta && (
        <div className="vf-meta">
          {model.trackText ? <span className="vf-footer-item">{labels.track} <b>{model.trackText}</b></span> : null}
          {model.playerBadgeText ? <span className="vf-footer-item vf-footer-item--end"><b>{model.playerBadgeText}</b></span> : null}
        </div>
      )}
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && <p className="vf-detail">{model.statusMessage}</p>}
      {!unavailable && visibleRows.length > 0 && (
        <div className="vf-table-wrap">
        <table className="vf-table" aria-label={labels.relative}>
          <colgroup>{columns.map((column) => <col key={column.id} style={{ width: resolveColumnWidthPixels(column, RELATIVE_COLUMN_TEMPLATES.find((template) => template.metricId === column.metricId)?.defaultWidth ?? 60) }} />)}</colgroup>
          <tbody>{visibleRows.map((row) => (
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
        </div>
      )}
      {slots.length > 0 && !unavailable && (
        <div className="vf-slots" data-footer-slots>
          {slots.map((slot) => <span key={slot.id} className="vf-slot" data-slot={slot.id}><span className="vf-slot-label">{slot.label}</span><b className="vf-slot-value">{slot.value}</b></span>)}
        </div>
      )}
      {hasFooter && (
        <div className="vf-footer" data-session-footer>
          {model.sessionLabel ? <span className="vf-footer-item"><b>{model.sessionLabel}{model.remainingText ? ` ${model.remainingText}` : ""}</b></span> : model.remainingText ? <span className="vf-footer-item"><b>{model.remainingText}</b></span> : null}
          {model.ambientTempText ? <span className="vf-footer-item vf-footer-item--end">{labels.ambientTemp} <b>{model.ambientTempText}</b></span> : null}
          {model.trackTempText ? <span className="vf-footer-item">{labels.trackTemp} <b>{model.trackTempText}</b></span> : null}
          {model.windText ? <span className="vf-footer-item">{labels.wind} <b>{model.windText}</b></span> : null}
        </div>
      )}
    </section>
  );
}
