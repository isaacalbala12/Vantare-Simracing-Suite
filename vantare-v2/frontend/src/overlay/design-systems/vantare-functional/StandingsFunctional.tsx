import { useMemo, useRef, type CSSProperties } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { useStandingsMotion } from "./useStandingsMotion";
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
import { functionalLabels, sessionDisplayLabel, localizeStandingsValue } from "./labels";
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
  useStandingsMotion(model, motion, rootRef);
  const labels = functionalLabels[locale];
  const config = parseFunctionalSettings(settings);
  const broadcast = config.templateId === "broadcast";
  const session = useMemo(() => model.sessionLabel.toLowerCase(), [model.sessionLabel]);
  const paceSession = session === "practice" || session === "qualifying";
  const sessionLabel = useMemo(() => sessionDisplayLabel(locale, model.sessionLabel), [locale, model.sessionLabel]);
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
  const footerSlots = config.showSessionFooter ? resolveFunctionalFooterSlots(model, footerSlotIds, labels) : [];
  const innerWidth = Math.max(80, (layout?.w ?? 0) - 24);
  const slotsTotal = footerSlots.reduce(
    (sum, slot) => sum + footerSlotItemWidth(slot.label, slot.value),
    0,
  ) + Math.max(0, footerSlots.length - 1) * FOOTER_SLOT_GAP_PX;
  const slotScale = layout?.w !== undefined && footerSlots.length > 0 && footerSlots.length <= 5
    ? Math.min(1, (innerWidth * 0.97) / slotsTotal)
    : 1;
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
  const footerHeight = slotsHeight || (config.showSessionFooter ? 22 : 0);
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
  const pitIndicators: Array<{ key: string; id: string; top: number; active: boolean }> = [];
  if (pitEnabled) {
    let top = tableHeaderHeight;
    for (const entry of entries) {
      const entryHeight = entry.kind === "class" ? FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT : 30;
      if (entry.kind === "row") {
        pitIndicators.push({ key: entry.key, id: entry.row.id, top, active: Boolean(entry.row.pitText) });
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
              data-session-best={model.sessionBest?.rowId === entry.row.id || undefined}
              data-standings-group={tonalPodium ? (entry.row.position <= 3 ? "podium" : "context") : undefined}
              data-standings-context-start={tonalPodium && entry.row.id === firstContextRowId ? "true" : undefined}
            >
              {columns.map((column) => {
                const row = entry.row;
                const value = column.metricId === "position"
                  ? entry.displayPosition > 0 ? String(entry.displayPosition) : "—"
                  : column.metricId === "driverName"
                    ? row.configuredDriverName ?? row.driverName
                    : resolveStandingsCellValue(row, column.metricId);
                const displayValue = localizeStandingsValue(value, labels);
                const seconds = (column.metricId === "gap" || column.metricId === "interval") ? /^([+-]?\d+(?:\.\d+)?)(s)$/.exec(value) : null;
                return <td key={column.id} data-metric={column.metricId} data-identity={IDENTITY.has(column.metricId) || undefined} aria-label={`${labelFor(column.metricId)}: ${displayValue}`} style={{ textAlign: column.metricId === "gap" ? "center" : column.style?.align ?? (column.metricId === "driverName" ? "left" : IDENTITY.has(column.metricId) ? "center" : "right") }}>
                  {column.metricId === "driverName" ? <><span className="vf-battle-accent" aria-hidden="true" /><span className="vf-driver"><span className="vf-driver-name" title={value}>{value}</span><span className="vf-position-change" data-position-change aria-hidden="true" /></span></> : <span title={displayValue} className={`vf-cell-value${seconds ? " vf-gap-number" : ""}`}>{seconds ? <>{seconds[1]}<small className="vf-time-unit">{seconds[2]}</small></> : displayValue}</span>}
                  {column.metricId === "bestLap" && <><span className="vf-lap-sweep" aria-hidden="true" /><span className="vf-lap-record" aria-hidden="true">◆</span></>}
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
        {pitIndicators.length > 0 ? <div className="vf-pit-rail" aria-label={labels.pit}>
          {pitIndicators.map((indicator) => <span key={indicator.key} className="vf-pit-row" data-pit-row={indicator.id} style={{ top: `${indicator.top}px` }}>
            <span className="vf-pit-label" data-pit-indicator={indicator.active || undefined} data-pit-active={indicator.active || undefined} role={indicator.active ? "img" : undefined} aria-hidden={!indicator.active} aria-label={indicator.active ? labels.pit : undefined} title={indicator.active ? labels.pit : undefined}>{labels.pit}</span>
          </span>)}
        </div> : null}
        </div>
      )}
      {footerSlots.length > 0 && !unavailable ? (
        <div className="vf-slots" data-footer-slots data-fit={footerSlots.length <= 5 ? "one-line" : undefined} style={{ "--vf-slot-scale": slotScale.toFixed(3) } as CSSProperties}>
          {footerSlots.map((slot) => <span key={slot.id} className="vf-slot" data-slot={slot.id}><span className="vf-slot-label">{slot.label}</span><b className="vf-slot-value">{slot.value}</b></span>)}
        </div>
      ) : config.showSessionFooter ? (
        <SessionInfo className="vf-session-footer" choices={[config.footerFirst, config.footerSecond]} model={model} labels={labels} />
      ) : null}
    </section>
  );
}
