import { useRef, type CSSProperties } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { flipRows, useWidgetMotion } from "../../core/widget-motion";
import { FUNCTIONAL_IDENTITY_METRICS as IDENTITY, resolveFunctionalColumnWidth, resolveFunctionalIdentitySpan, resolveFunctionalHeaderInfoPlacement } from "../../widget-types/standings/functional-standings-layout";
import { resolveStandingsCellValue, type StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { functionalLabels } from "./labels";
import vantareMark from "../../../assets/orbit/vantare-mark.png";
import { parseFunctionalSettings } from "./session-info-settings";
import { SessionInfo } from "./SessionInfo";
import { deriveOvertakes } from "./functional-motion";
import {
  FOOTER_SLOT_GAP_PX,
  footerSlotItemWidth,
  resolveFunctionalFooterSlots,
} from "./footer-slots";

export function StandingsFunctional({ model, settings, layout, motion = "full", effects }: WidgetRendererProps<StandingsViewModel>) {
  const { locale } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  useWidgetMotion(model, motion !== "minimal", rootRef, ({ prev, next, root, schedule, persist }) => {
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
        schedule(650, () => { delete row.dataset.motion; }, `motion-${id}`);
      }
    }
  }, (root) => {
    root.querySelectorAll<HTMLElement>("[data-motion]").forEach((element) => { delete element.dataset.motion; });
  });
  const labels = functionalLabels[locale];
  const config = parseFunctionalSettings(settings);
  const broadcast = config.templateId === "broadcast";
  const session = model.sessionLabel.toLowerCase();
  const paceSession = session === "practice" || session === "qualifying";
  const sessionLabel = session === "race" || session === "practice" || session === "qualifying" ? labels[session] : model.sessionLabel;
  const columns = model.columns;
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
  const infoPlacement = resolveFunctionalHeaderInfoPlacement(columns, config);
  const splitHeader = infoPlacement === "split";
  const unavailable = model.status === "disconnected" || model.status === "missing" || model.status === "error";
  const externalHeader = !identitySpan || unavailable || broadcast || model.rows.length === 0;
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;
  const labelFor = (metric: string) => metric === "gap" && paceSession ? labels.paceGap : labels[metric as keyof typeof labels] ?? metric;
  const headerInfo = <SessionInfo className="vf-header-info" choices={[config.headerFirst, config.headerSecond]} model={model} labels={labels} />;

  const sessionHeader = <div className="vf-session" title={`${sessionLabel} · ${labels.remaining}`}>
    {brandVisible ? <span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span> : null}
    <span className="vf-session-context"><span className="vf-session-type" role={model.status === "stale" ? "status" : undefined}>{model.status === "stale" ? labels.stale : sessionLabel}</span><span className="vf-clock">{model.remainingText}</span></span>
    <span className="vf-class" title={model.activeClass}>{model.activeClass}</span>
    {infoPlacement === "inline" && headerInfo}
  </div>;

  return (
    <section ref={rootRef} className="vf-standings" data-widget-system="vantare-functional" data-widget-renderer="standings" data-template={broadcast ? "broadcast" : "signature"} data-session-header={hasHeader} data-status={model.status} data-session={session} data-flag={model.status === "ready" ? model.flag ?? "unknown" : "unknown"} data-effects={effects} data-motion-level={motion}>
      {!hasHeader && brandVisible && <div className="vf-brand-band"><span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span></div>}
      {externalHeader && hasHeader && sessionHeader}
      {externalHeader && infoPlacement === "band" && <div className="vf-info-band">{headerInfo}</div>}
      {statusText && model.status !== "stale" && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {!unavailable && model.rows.length > 0 && (
        <table className="vf-table" aria-label={`${sessionLabel} · ${model.activeClass}`}>
          <colgroup>{columns.map((column) => <col key={column.id} style={{ width: resolveFunctionalColumnWidth(column, broadcast) }} />)}</colgroup>
          <thead>{splitHeader ? <>
            <tr className="vf-info-row"><th rowSpan={2} colSpan={identitySpan} scope="colgroup" className="vf-identity-head">{sessionHeader}</th><th colSpan={columns.length - identitySpan} className="vf-info-head">{headerInfo}</th></tr>
            <tr className="vf-metric-row">{columns.slice(identitySpan).map(column => <th key={column.id} scope="col" data-metric={column.metricId} title={labelFor(column.metricId)}><span className="vf-column-label">{labelFor(column.metricId)}</span></th>)}</tr>
          </> : <tr>
            {model.status === "stale" && !hasHeader ? <th colSpan={columns.length} className="vf-source-notice" role="status">{statusText}</th> : <>
            {!broadcast && identitySpan > 0 && <th colSpan={identitySpan} scope="colgroup" className="vf-identity-head">{hasHeader ? sessionHeader : <span className="vf-heading-name">{labels.driverName}</span>}</th>}
            {columns.slice(broadcast ? 0 : identitySpan).map((column) => <th key={column.id} scope="col" data-metric={column.metricId} title={labelFor(column.metricId)}><span className="vf-column-label">{labelFor(column.metricId)}</span></th>)}
            </>}
          </tr>}{!externalHeader && infoPlacement === "band" && <tr><th colSpan={columns.length} className="vf-info-band">{headerInfo}</th></tr>}</thead>
          <tbody>{model.rows.map((row) => (
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
      )}
      {footerSlots.length > 0 && !unavailable ? (
        <div className="vf-slots" data-footer-slots data-fit={footerSlots.length <= 5 ? "one-line" : undefined} style={{ "--vf-slot-scale": slotScale.toFixed(3) } as CSSProperties}>
          {footerSlots.map((slot) => <span key={slot.id} className="vf-slot" data-slot={slot.id}><span className="vf-slot-label">{slot.label}</span><b className="vf-slot-value">{slot.value}</b></span>)}
        </div>
      ) : hasAmbientFooter && !unavailable ? (
        <div className="vf-footer" data-session-footer>
          {model.trackTempText ? <span className="vf-footer-item">{labels.trackTemp} <b>{model.trackTempText}</b></span> : null}
          {model.ambientTempText ? <span className="vf-footer-item">{labels.ambientTemp} <b>{model.ambientTempText}</b></span> : null}
          {model.windText ? <span className="vf-footer-item vf-footer-item--end">{labels.wind} <b>{model.windText}</b></span> : null}
        </div>
      ) : config.showSessionFooter ? (
        <SessionInfo className="vf-session-footer" choices={[config.footerFirst, config.footerSecond]} model={model} labels={labels} />
      ) : null}
    </section>
  );
}
