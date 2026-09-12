import type { CSSProperties } from "react";
import { useRef } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { flipRows, useWidgetMotion } from "../../core/widget-motion";
import { deriveOvertakes } from "./functional-motion";
import { FUNCTIONAL_IDENTITY_METRICS as IDENTITY, resolveFunctionalColumnWidth, resolveFunctionalIdentitySpan } from "../../widget-types/standings/functional-standings-layout";
import { resolveStandingsCellValue, type StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { functionalLabels } from "./labels";
import { FOOTER_SLOT_GAP_PX, FOOTER_SLOT_PAD_PX, FOOTER_SLOT_ROW_PX, footerSlotItemWidth, resolveFunctionalFooterSlots } from "./footer-slots";
import vantareMark from "../../../assets/orbit/vantare-mark.png";


export function StandingsFunctional({ model, settings, layout, motion = "full", effects }: WidgetRendererProps<StandingsViewModel>) {
  const { locale } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  // Eficiencia: las filas se deslizan a su posición (FLIP) y los cambios de
  // posición parpadean una vez. En "reduced" solo queda el deslizamiento.
  useWidgetMotion(model, motion !== "minimal", rootRef, ({ prev, next, root, schedule, persist }) => {
    // FLIP medido por id: la fila desliza desde su posición visual actual
    // (incluido el resto de una animación en vuelo) hasta su nuevo sitio —
    // no desde un stride por índice que teletransporta al re-target.
    flipRows(root, persist, {
      rows: "[data-standings-row]",
      id: (row) => row.dataset.standingsRow,
      duration: (from) => Math.min(460, 260 + (Math.abs(from) / 30) * 50),
    });
    if (motion === "full") {
      const { gained, lost } = deriveOvertakes(prev.rows, next.rows);
      for (const [id, direction] of [...gained.map((id) => [id, "rise"] as const), ...lost.map((id) => [id, "fall"] as const)]) {
        const row = root.querySelector<HTMLElement>(`[data-standings-row="${CSS.escape(id)}"]`);
        if (!row) continue;
        row.dataset.motion = direction;
        // La clave cancela el borrado anterior del mismo attr — sin ella el
        // timer de un evento viejo apagaba el flash del siguiente.
        schedule(650, () => { delete row.dataset.motion; }, `motion-${id}`);
      }
    }
  }, (root) => {
    root.querySelectorAll<HTMLElement>("[data-motion]").forEach((el) => { delete el.dataset.motion; });
  });
  const labels = functionalLabels[locale];
  const broadcast = settings.templateId === "broadcast";
  const session = model.sessionLabel.toLowerCase();
  const paceSession = session === "practice" || session === "qualifying";
  const sessionLabel = session === "race" || session === "practice" || session === "qualifying" ? labels[session] : model.sessionLabel;
  const columns = model.columns;
  const identitySpan = resolveFunctionalIdentitySpan(columns);
  const hasHeader = settings.showSessionHeader !== false;
  // Decisión pura de presentación (ISA-1105): la inyecta el host desde la
  // política nativa y la preferencia del documento. Sin ella se conserva el
  // comportamiento previo (marca con cabecera).
  const brandVisible = (settings.brandVisible as boolean | undefined) ?? hasHeader;
  const footerSlots = Array.isArray(settings.footerSlots) ? (settings.footerSlots as unknown[]).filter((s): s is string => typeof s === "string") : [];
  const slots = footerSlots.length > 0 ? resolveFunctionalFooterSlots(model, footerSlots, labels) : [];
  const hasFooter = slots.length === 0 && Boolean(model.trackTempText || model.ambientTempText || model.windText);
  const unavailable = model.status === "disconnected" || model.status === "missing" || model.status === "error";
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;
  const labelFor = (metric: string) => metric === "gap" && paceSession ? labels.paceGap : labels[metric as keyof typeof labels] ?? metric;

  // Presupuesto de filas: el pie nunca se corta y la tabla cede en filas
  // completas — una media fila colgando es peor que una fila menos.
  // Sin layout (tests, hosts antiguos) no se recorta nada.
  const innerWidth = Math.max(80, (layout?.w ?? 0) - 24);
  const slotsTotal = slots.reduce((sum, slot) => sum + footerSlotItemWidth(slot.label, slot.value), 0) + Math.max(0, slots.length - 1) * FOOTER_SLOT_GAP_PX;
  // Regla de Isaac: hasta 5 huecos siempre caben en una fila (la letra se
  // reduce); con más de 5 se permite una segunda fila a tamaño normal.
  const slotScale = layout?.w !== undefined && slots.length > 0 && slots.length <= 5 ? Math.min(1, (innerWidth * 0.97) / slotsTotal) : 1;
  const slotRows = slots.length <= 5 ? (slots.length > 0 ? 1 : 0) : Math.ceil(slotsTotal / innerWidth);
  const slotsHeight = slotRows > 0 ? FOOTER_SLOT_PAD_PX + slotRows * FOOTER_SLOT_ROW_PX : 0;
  const ambientHeight = slots.length === 0 && hasFooter ? 30 : 0;
  const brandBandHeight = !hasHeader && brandVisible ? 24 : 0;
  // Constantes espejo de resolveFunctionalStandingsSize: broadcast lleva la
  // cabecera suelta (46) + thead de columnas (24); signature lleva la
  // cabecera dentro del thead (50) salvo que no haya bloque de identidad,
  // que entonces vive suelta encima (49).
  const theadHeight = broadcast ? 24 : 50;
  const looseHeaderHeight = broadcast
    ? (hasHeader ? 46 : 0)
    : ((!identitySpan || unavailable) && hasHeader ? 49 : 0);
  const tableSpace = layout?.h === undefined ? Number.POSITIVE_INFINITY : layout.h - looseHeaderHeight - slotsHeight - ambientHeight - brandBandHeight;
  const rowsFit = Math.max(0, Math.floor((tableSpace - theadHeight) / 30));
  const visibleRows = Number.isFinite(tableSpace) ? model.rows.slice(0, rowsFit) : model.rows;

  const sessionHeader = <div className={`vf-session${brandVisible ? "" : " vf-session--bare"}`} title={`${sessionLabel} · ${labels.remaining}`}>
    {brandVisible ? <span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span> : null}
    <span className="vf-session-context"><span className="vf-session-type" role={model.status === "stale" ? "status" : undefined}>{model.status === "stale" ? labels.stale : sessionLabel}</span><span className="vf-clock">{model.remainingText}</span></span>
    <span className="vf-class" title={model.activeClass}>{model.activeClass}</span>
  </div>;

  return (
    <section ref={rootRef} className="vf-standings" data-widget-system="vantare-functional" data-widget-renderer="standings" data-template={broadcast ? "broadcast" : "signature"} data-session-header={hasHeader} data-status={model.status} data-session={session} data-effects={effects} data-motion-level={motion}>
      {!hasHeader && brandVisible && <div className="vf-brand-band"><span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span></div>}
      {(!identitySpan || unavailable || broadcast) && hasHeader && sessionHeader}
      {statusText && model.status !== "stale" && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {!unavailable && visibleRows.length > 0 && (
        <div className="vf-table-wrap">
        <table className="vf-table" aria-label={`${sessionLabel} · ${model.activeClass}`}>
          <colgroup>{columns.map((column) => <col key={column.id} style={{ width: resolveFunctionalColumnWidth(column, broadcast) }} />)}</colgroup>
          <thead><tr>
            {model.status === "stale" && !hasHeader ? <th colSpan={columns.length} className="vf-source-notice" role="status">{statusText}</th> : <>
            {!broadcast && identitySpan > 0 && <th colSpan={identitySpan} scope="colgroup" className="vf-identity-head">{hasHeader ? sessionHeader : <span className="vf-heading-name">{labels.driverName}</span>}</th>}
            {columns.slice(broadcast ? 0 : identitySpan).map((column) => <th key={column.id} scope="col" data-metric={column.metricId} title={labelFor(column.metricId)}><span className="vf-column-label">{labelFor(column.metricId)}</span></th>)}
            </>}
          </tr></thead>
          <tbody>{visibleRows.map((row) => (
            <tr key={row.id} data-standings-row={row.id} data-player={row.isPlayer || undefined}>
              {columns.map((column) => {
                const value = column.metricId === "driverName" ? row.configuredDriverName ?? row.driverName : resolveStandingsCellValue(row, column.metricId);
                const seconds = (column.metricId === "gap" || column.metricId === "interval") ? /^([+-]?\d+(?:\.\d+)?)(s)$/.exec(value) : null;
                return <td key={column.id} data-metric={column.metricId} data-identity={IDENTITY.has(column.metricId) || undefined} aria-label={`${labelFor(column.metricId)}: ${value}`} style={{ textAlign: column.metricId === "gap" ? "center" : column.style?.align ?? (column.metricId === "driverName" ? "left" : IDENTITY.has(column.metricId) ? "center" : "right") }}>
                  {column.metricId === "driverName" ? <span className="vf-driver"><span className="vf-driver-name" title={value}>{value}</span></span> :
                    column.metricId === "pit" ? <span title={value} className={row.pitText ? "vf-pit" : undefined}>{value}</span> : <span title={value} className={`vf-cell-value${seconds ? " vf-gap-number" : ""}`}>{seconds ? <>{seconds[1]}<small className="vf-time-unit">{seconds[2]}</small></> : value}</span>}
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
      {hasFooter && !unavailable && (
        <div className="vf-footer" data-session-footer>
          {model.trackTempText ? <span className="vf-footer-item">{labels.trackTemp} <b>{model.trackTempText}</b></span> : null}
          {model.ambientTempText ? <span className="vf-footer-item">{labels.ambientTemp} <b>{model.ambientTempText}</b></span> : null}
          {model.windText ? <span className="vf-footer-item vf-footer-item--end">{labels.wind} <b>{model.windText}</b></span> : null}
        </div>
      )}
    </section>
  );
}
