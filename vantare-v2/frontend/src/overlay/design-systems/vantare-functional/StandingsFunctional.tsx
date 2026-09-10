import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { FUNCTIONAL_IDENTITY_METRICS as IDENTITY, resolveFunctionalColumnWidth, resolveFunctionalIdentitySpan } from "../../widget-types/standings/functional-standings-layout";
import { resolveStandingsCellValue, type StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { functionalLabels } from "./labels";
import vantareMark from "../../../assets/orbit/vantare-mark.png";

export function StandingsFunctional({ model, settings }: WidgetRendererProps<StandingsViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const broadcast = settings.templateId === "broadcast";
  const session = model.sessionLabel.toLowerCase();
  const paceSession = session === "practice" || session === "qualifying";
  const sessionLabel = session === "race" || session === "practice" || session === "qualifying" ? labels[session] : model.sessionLabel;
  const columns = model.columns;
  const identitySpan = resolveFunctionalIdentitySpan(columns);
  const hasHeader = settings.showSessionHeader !== false;
  const hasFooter = Boolean(model.trackTempText || model.ambientTempText || model.windText);
  const unavailable = model.status === "disconnected" || model.status === "missing" || model.status === "error";
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;
  const labelFor = (metric: string) => metric === "gap" && paceSession ? labels.paceGap : labels[metric as keyof typeof labels] ?? metric;

  const sessionHeader = <div className="vf-session" title={`${sessionLabel} · ${labels.remaining}`}>
    <span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span>
    <span className="vf-session-context"><span className="vf-session-type" role={model.status === "stale" ? "status" : undefined}>{model.status === "stale" ? labels.stale : sessionLabel}</span><span className="vf-clock">{model.remainingText}</span></span>
    <span className="vf-class" title={model.activeClass}>{model.activeClass}</span>
  </div>;

  return (
    <section className="vf-standings" data-widget-system="vantare-functional" data-widget-renderer="standings" data-template={broadcast ? "broadcast" : "signature"} data-session-header={hasHeader} data-status={model.status} data-session={session}>
      {(!identitySpan || unavailable || broadcast) && hasHeader && sessionHeader}
      {statusText && model.status !== "stale" && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {!unavailable && model.rows.length > 0 && (
        <table className="vf-table" aria-label={`${sessionLabel} · ${model.activeClass}`}>
          <colgroup>{columns.map((column) => <col key={column.id} style={{ width: resolveFunctionalColumnWidth(column, broadcast) }} />)}</colgroup>
          <thead><tr>
            {model.status === "stale" && !hasHeader ? <th colSpan={columns.length} className="vf-source-notice" role="status">{statusText}</th> : <>
            {!broadcast && identitySpan > 0 && <th colSpan={identitySpan} scope="colgroup" className="vf-identity-head">{hasHeader ? sessionHeader : <span className="vf-heading-name">{labels.driverName}</span>}</th>}
            {columns.slice(broadcast ? 0 : identitySpan).map((column) => <th key={column.id} scope="col" data-metric={column.metricId} title={labelFor(column.metricId)}><span className="vf-column-label">{labelFor(column.metricId)}</span></th>)}
            </>}
          </tr></thead>
          <tbody>{model.rows.map((row) => (
            <tr key={row.id} data-standings-row={row.id} data-player={row.isPlayer || undefined}>
              {columns.map((column) => {
                const value = column.metricId === "driverName" ? row.configuredDriverName ?? row.driverName : resolveStandingsCellValue(row, column.metricId);
                const seconds = (column.metricId === "gap" || column.metricId === "interval") ? /^([+-]?\d+(?:\.\d+)?)(s)$/.exec(value) : null;
                return <td key={column.id} data-metric={column.metricId} data-identity={IDENTITY.has(column.metricId) || undefined} aria-label={`${labelFor(column.metricId)}: ${value}`} style={{ textAlign: column.style?.align ?? (column.metricId === "driverName" ? "left" : IDENTITY.has(column.metricId) ? "center" : "right") }}>
                  {column.metricId === "driverName" ? <span className="vf-driver"><span className="vf-driver-name" title={value}>{value}</span></span> :
                    column.metricId === "pit" ? <span title={value} className={row.pitText ? "vf-pit" : undefined}>{value}</span> : <span title={value} className={`vf-cell-value${seconds ? " vf-gap-number" : ""}`}>{seconds ? <>{seconds[1]}<small className="vf-time-unit">{seconds[2]}</small></> : value}</span>}
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
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
