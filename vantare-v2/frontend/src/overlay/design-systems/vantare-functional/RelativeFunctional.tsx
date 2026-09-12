import type { CSSProperties } from "react";
import { useRef } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { useWidgetMotion } from "../../core/widget-motion";
import { deriveIndexOffsets, deriveSideCrosses } from "./functional-motion";
import { resolveColumnWidthPixels } from "../../widget-types/shared/widget-column";
import { RELATIVE_COLUMN_TEMPLATES } from "../../widget-types/relative/relative-content";
import { resolveRelativeClassColor } from "../../widget-types/relative/relative-renderer-helpers";
import { resolveRelativeCellValue, type RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { functionalLabels } from "./labels";
import { FOOTER_SLOT_GAP_PX, FOOTER_SLOT_PAD_PX, FOOTER_SLOT_ROW_PX, footerSlotItemWidth, resolveFunctionalFooterSlots } from "./footer-slots";

const CENTERED = new Set(["position", "class", "carNumber", "gap"]);
const LAP_METRICS = new Set(["bestLap", "lastLap"]);

// Alto de fila en px CSS sin escalar (tokens.css: td height 28px). Medirlo
// con getBoundingClientRect devuelve px YA escalados por el viewport — con
// eso el presupuesto admitía ~40% más filas de las que caben.
const RELATIVE_ROW_PX = 28;

export function RelativeFunctional({ model, settings, layout, motion = "full", effects }: WidgetRendererProps<RelativeViewModel>) {
  const { locale } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  // Eficiencia: las filas se deslizan al cruzarse; los cruces parpadean una
  // vez en "full".
  useWidgetMotion(model, motion !== "minimal", rootRef, ({ prev, next, root, schedule }) => {
    // offsetHeight = px de layout sin escalar (ver standings).
    const stride = root.querySelector<HTMLElement>("[data-relative-row]")?.offsetHeight ?? RELATIVE_ROW_PX;
    for (const [id, delta] of deriveIndexOffsets(prev.rows, next.rows)) {
      const row = root.querySelector<HTMLElement>(`[data-relative-row="${CSS.escape(id)}"]`);
      if (!row) continue;
      row.getAnimations().forEach((animation) => {
        if (typeof CSSTransition === "undefined" || !(animation instanceof CSSTransition)) animation.cancel();
      });
      row.animate(
        [{ transform: `translateY(${delta * stride}px)` }, { transform: "translateY(0)" }],
        { duration: Math.min(400, 240 + Math.abs(delta) * 45), easing: "cubic-bezier(0.22, 0.9, 0.3, 1)" },
      );
    }
    if (motion === "full") {
      const { gained, lost } = deriveSideCrosses(prev.rows, next.rows);
      for (const [id, direction] of [...gained.map((id) => [id, "rise"] as const), ...lost.map((id) => [id, "fall"] as const)]) {
        const row = root.querySelector<HTMLElement>(`[data-relative-row="${CSS.escape(id)}"]`);
        if (!row) continue;
        row.dataset.cross = direction;
        schedule(600, () => { delete row.dataset.cross; }, `cross-${id}`);
      }
    }
  }, (root) => {
    root.querySelectorAll<HTMLElement>("[data-cross]").forEach((el) => { delete el.dataset.cross; });
  });
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
  const slotsTotal = slots.reduce((sum, slot) => sum + footerSlotItemWidth(slot.label, slot.value), 0) + Math.max(0, slots.length - 1) * FOOTER_SLOT_GAP_PX;
  // Misma regla que standings: hasta 5 en una fila (letra reducida), más
  // de 5 permite segunda fila.
  const slotScale = layout?.w !== undefined && slots.length > 0 && slots.length <= 5 ? Math.min(1, (innerWidth * 0.97) / slotsTotal) : 1;
  const slotRows = slots.length <= 5 ? (slots.length > 0 ? 1 : 0) : Math.ceil(slotsTotal / innerWidth);
  const slotsHeight = slotRows > 0 ? FOOTER_SLOT_PAD_PX + slotRows * FOOTER_SLOT_ROW_PX : 0;
  const tableSpace = layout?.h === undefined
    ? Number.POSITIVE_INFINITY
    : layout.h - (hasMeta ? 30 : 0) - slotsHeight - (slots.length === 0 && hasFooter ? 30 : 0);
  const rowsFit = Math.max(0, Math.floor(tableSpace / RELATIVE_ROW_PX));
  const visibleRows = Number.isFinite(tableSpace) ? model.rows.slice(0, rowsFit) : model.rows;

  return (
    // Estructura de la referencia: barra de meta arriba (pista + posición del
    // jugador), lista de filas, barra inferior (sesión/reloj + ambiente). Cada
    // hueco solo se pinta cuando la fuente entrega el dato.
    <section ref={rootRef} className="vf-relative" data-widget-system="vantare-functional" data-widget-renderer="relative" data-status={model.status} data-effects={effects} data-motion-level={motion}>
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
        <div className="vf-slots" data-footer-slots data-fit={slots.length <= 5 ? "one-line" : undefined} style={{ "--vf-slot-scale": slotScale.toFixed(3) } as CSSProperties}>
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
