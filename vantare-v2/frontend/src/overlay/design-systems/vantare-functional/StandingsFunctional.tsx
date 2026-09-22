import { useRef, type CSSProperties } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { flipRows, useWidgetMotion } from "../../core/widget-motion";
import { deriveOvertakes } from "./functional-motion";
import {
  FUNCTIONAL_BROADCAST_COLUMN_HEADER_HEIGHT,
  FUNCTIONAL_BROADCAST_SESSION_HEADER_HEIGHT,
  FUNCTIONAL_IDENTITY_METRICS as IDENTITY,
  FUNCTIONAL_SIGNATURE_COLUMN_HEADER_HEIGHT,
  FUNCTIONAL_SIGNATURE_SESSION_HEADER_HEIGHT,
  resolveFunctionalColumnWidth,
  resolveFunctionalIdentitySpan,
} from "../../widget-types/standings/functional-standings-layout";
import {
  buildFunctionalStandingsEntries,
  FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT,
  takeFunctionalStandingsRows,
} from "../../widget-types/standings/functional-standings-multiclass";
import { resolveStandingsCellValue, type StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { functionalLabels } from "./labels";
import vantareMark from "../../../assets/orbit/vantare-mark.png";
import { parseFunctionalSettings } from "./session-info-settings";
import { SessionInfo } from "./SessionInfo";
import {
  FOOTER_SLOT_GAP_PX,
  FOOTER_SLOT_PAD_PX,
  FOOTER_SLOT_ROW_PX,
  footerSlotItemWidth,
  resolveFunctionalFooterSlots,
} from "./footer-slots";

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
  const config = parseFunctionalSettings(settings);
  const broadcast = config.templateId === "broadcast";
  const session = model.sessionLabel.toLowerCase();
  const paceSession = session === "practice" || session === "qualifying";
  const sessionLabel = session === "race" || session === "practice" || session === "qualifying" ? labels[session] : model.sessionLabel;
  const configuredColumns = model.columns;
  // Pit is a row status, not a timing metric: keep its module in the content
  // contract, but render its label beyond the final visible metric instead of
  // reserving a standalone table column.
  const columns = configuredColumns.filter((column) => column.metricId !== "pit");
  const pitEnabled = configuredColumns.some((column) => column.metricId === "pit" && column.enabled);
  const identitySpan = resolveFunctionalIdentitySpan(columns);
  const hasHeader = config.showSessionHeader;
  // Decisión pura de presentación (ISA-1105): la inyecta WidgetVisualHost
  // desde la política nativa y la preferencia del documento. Sin ella se
  // conserva el comportamiento previo (marca con cabecera).
  const brandVisible = settings.brandVisible ?? hasHeader;
  const footerSlotIds = Array.isArray(settings.footerSlots)
    ? settings.footerSlots.filter((slot): slot is string => typeof slot === "string")
    : [];
  const footerSlots = resolveFunctionalFooterSlots(model, footerSlotIds, labels);
  const innerWidth = Math.max(80, (layout?.w ?? 0) - 24);
  const slotsTotal = footerSlots.reduce(
    (sum, slot) => sum + footerSlotItemWidth(slot.label, slot.value),
    0,
  ) + Math.max(0, footerSlots.length - 1) * FOOTER_SLOT_GAP_PX;
  const slotScale = layout?.w !== undefined && footerSlots.length > 0 && footerSlots.length <= 5
    ? Math.min(1, (innerWidth * 0.97) / slotsTotal)
    : 1;
  const hasAmbientFooter = Boolean(model.trackTempText || model.ambientTempText || model.windText);
  const classScope = model.classScope ?? "player-class";
  const classificationMode = model.classificationMode
    ?? (classScope === "all-classes" ? "multiclass" : "normal");
  const multiclass = classificationMode === "multiclass";
  const unavailable = model.status === "disconnected" || model.status === "missing" || model.status === "error";
  const externalHeader = !identitySpan || unavailable || broadcast || model.rows.length === 0;
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;
  const labelFor = (metric: string) => metric === "gap" && paceSession ? labels.paceGap : labels[metric as keyof typeof labels] ?? metric;
  const slotRows = footerSlots.length <= 5 ? (footerSlots.length > 0 ? 1 : 0) : Math.ceil(slotsTotal / innerWidth);
  const slotsHeight = slotRows > 0 ? FOOTER_SLOT_PAD_PX + slotRows * FOOTER_SLOT_ROW_PX : 0;
  const footerHeight = slotsHeight || (hasAmbientFooter ? 30 : config.showSessionFooter ? 22 : 0);
  const brandBandHeight = !hasHeader && brandVisible ? 22 : 0;
  const looseHeaderHeight = externalHeader && hasHeader
    ? (broadcast ? FUNCTIONAL_BROADCAST_SESSION_HEADER_HEIGHT : FUNCTIONAL_SIGNATURE_SESSION_HEADER_HEIGHT)
    : 0;
  const tableHeaderHeight = broadcast
    ? FUNCTIONAL_BROADCAST_COLUMN_HEADER_HEIGHT
    : !hasHeader || externalHeader || identitySpan === 0
      ? FUNCTIONAL_SIGNATURE_COLUMN_HEADER_HEIGHT
      : FUNCTIONAL_SIGNATURE_SESSION_HEADER_HEIGHT;
  const tableSpace = layout?.h === undefined
    ? Number.POSITIVE_INFINITY
    : layout.h - footerHeight - brandBandHeight - looseHeaderHeight;
  const availableBodyHeight = tableSpace - tableHeaderHeight;
  const visibleRows = takeFunctionalStandingsRows(model.rows, classificationMode, availableBodyHeight);
  const entries = buildFunctionalStandingsEntries(visibleRows, classificationMode);
  const tonalPodium = classificationMode === "normal";
  const firstContextRowId = tonalPodium
    ? visibleRows.find((row) => row.position > 3)?.id
    : undefined;
  // Keep the PIT badge outside the table's geometry. The rail mirrors the
  // table rows, so the badge stays aligned without reserving a fake metric
  // column or changing the width of the standings card.
  const pitIndicators: Array<{ key: string; top: number }> = [];
  if (pitEnabled) {
    let top = tableHeaderHeight;
    for (const entry of entries) {
      const entryHeight = entry.kind === "class" ? FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT : 30;
      if (entry.kind === "row" && entry.row.pitText) {
        pitIndicators.push({ key: entry.key, top: top + entryHeight / 2 });
      }
      top += entryHeight;
    }
  }

  const sessionHeader = <div className={`vf-session${brandVisible ? "" : " vf-session--bare"}`} title={`${sessionLabel} · ${labels.remaining}`}>
    {brandVisible ? <span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span> : null}
    <span className="vf-session-context"><span className="vf-session-type" role={model.status === "stale" ? "status" : undefined}>{model.status === "stale" ? labels.stale : sessionLabel}</span><span className="vf-clock">{model.remainingText}</span></span>
    <span className="vf-class" title={model.activeClass}>{model.activeClass.slice(0, 3).toUpperCase()}</span>
  </div>;

  return (
    <section ref={rootRef} className="vf-standings" data-widget-system="vantare-functional" data-widget-renderer="standings" data-template={broadcast ? "broadcast" : "signature"} data-session-header={hasHeader} data-pit-module={pitEnabled || undefined} data-class-scope={classScope} data-classification-mode={classificationMode} data-multiclass={multiclass || undefined} data-status={model.status} data-session={session} data-flag={model.status === "ready" ? model.flag ?? "unknown" : "unknown"} data-effects={effects} data-motion-level={motion}>
      {!hasHeader && brandVisible && <div className="vf-brand-band"><span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span></div>}
      {externalHeader && hasHeader && sessionHeader}
      {statusText && model.status !== "stale" && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {!unavailable && visibleRows.length > 0 && (
        <div className="vf-table-wrap" data-pit-enabled={pitEnabled || undefined}>
        <table className="vf-table" aria-label={`${sessionLabel} · ${model.activeClass}`}>
          <colgroup>{columns.map((column) => column.metricId === "driverName"
            ? <col key={column.id} />
            : <col key={column.id} style={{ width: resolveFunctionalColumnWidth(column, broadcast) }} />)}</colgroup>
          <thead><tr>
            {model.status === "stale" && !hasHeader ? <th colSpan={columns.length} className="vf-source-notice" role="status">{statusText}</th> : <>
            {!broadcast && identitySpan > 0 && <th colSpan={identitySpan} scope="colgroup" className="vf-identity-head">{hasHeader ? sessionHeader : <span className="vf-heading-name">{labels.driverName}</span>}</th>}
            {columns.slice(broadcast ? 0 : identitySpan).map((column) => <th key={column.id} scope="col" data-metric={column.metricId} title={labelFor(column.metricId)}><span className="vf-column-label">{labelFor(column.metricId)}</span></th>)}
            </>}
          </tr></thead>
          <tbody>{entries.map((entry) => entry.kind === "class" ? (
            <tr key={entry.key} className="vf-class-band" data-class-id={entry.classId} data-class-accent={entry.accent}>
              <th colSpan={columns.length} scope="rowgroup">
                <span className="vf-class-band__content"><span className="vf-class-band__accent" aria-hidden="true" /><span className="vf-class-band__label">{entry.label}</span></span>
              </th>
            </tr>
          ) : (
            <tr
              key={entry.key}
              data-standings-row={entry.row.id}
              data-player={entry.row.isPlayer || undefined}
              data-standings-group={tonalPodium ? (entry.row.position <= 3 ? "podium" : "context") : undefined}
              data-standings-context-start={tonalPodium && entry.row.id === firstContextRowId ? "true" : undefined}
            >
              {columns.map((column) => {
                const row = entry.row;
                const value = column.metricId === "position"
                  ? String(entry.displayPosition)
                  : column.metricId === "driverName"
                    ? row.configuredDriverName ?? row.driverName
                    : resolveStandingsCellValue(row, column.metricId);
                const seconds = (column.metricId === "gap" || column.metricId === "interval") ? /^([+-]?\d+(?:\.\d+)?)(s)$/.exec(value) : null;
                return <td key={column.id} data-metric={column.metricId} data-identity={IDENTITY.has(column.metricId) || undefined} aria-label={`${labelFor(column.metricId)}: ${value}`} style={{ textAlign: column.metricId === "gap" ? "center" : column.style?.align ?? (column.metricId === "driverName" ? "left" : IDENTITY.has(column.metricId) ? "center" : "right") }}>
                  {column.metricId === "driverName" ? <span className="vf-driver"><span className="vf-driver-name" title={value}>{value}</span></span> : <span title={value} className={`vf-cell-value${seconds ? " vf-gap-number" : ""}`}>{seconds ? <>{seconds[1]}<small className="vf-time-unit">{seconds[2]}</small></> : value}</span>}
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
        {pitIndicators.length > 0 ? <div className="vf-pit-rail" aria-label={labels.pit}>
          {pitIndicators.map((indicator) => <span key={indicator.key} className="vf-pit-label" data-pit-indicator role="img" aria-label={labels.pit} title={labels.pit} style={{ top: `${indicator.top}px` }}>{labels.pit}</span>)}
        </div> : null}
        </div>
      )}
      {footerSlots.length > 0 && !unavailable ? (
        <div className="vf-slots" data-footer-slots data-fit={footerSlots.length <= 5 ? "one-line" : undefined} style={{ "--vf-slot-scale": slotScale.toFixed(3) } as CSSProperties}>
          {footerSlots.map((slot) => <span key={slot.id} className="vf-slot" data-slot={slot.id}><span className="vf-slot-label">{slot.label}</span><b className="vf-slot-value">{slot.value}</b></span>)}
        </div>
      ) : hasAmbientFooter && !unavailable ? (
        <div className="vf-footer" data-session-footer>
          {model.trackTempText ? <span className="vf-footer-item">{labels.trackTemp} <b>{model.trackTempText}</b></span> : null}
          {model.ambientTempText ? <span className="vf-footer-item">{labels.ambientTemp} <b>{model.ambientTempText}</b></span> : null}
          {model.windText ? <span className="vf-footer-item">{labels.wind} <b>{model.windText}</b></span> : null}
        </div>
      ) : config.showSessionFooter ? (
        <SessionInfo className="vf-session-footer" choices={[config.footerFirst, config.footerSecond]} model={model} labels={labels} />
      ) : null}
    </section>
  );
}
