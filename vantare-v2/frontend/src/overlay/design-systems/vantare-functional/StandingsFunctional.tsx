import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { FUNCTIONAL_IDENTITY_METRICS as IDENTITY, resolveFunctionalColumnWidth, resolveFunctionalIdentitySpan, resolveFunctionalHeaderInfoPlacement } from "../../widget-types/standings/functional-standings-layout";
import { resolveStandingsCellValue, type StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { functionalLabels } from "./labels";
import vantareMark from "../../../assets/orbit/vantare-mark.png";
import { parseFunctionalSettings } from "./session-info-settings";
import { SessionInfo } from "./SessionInfo";

export function StandingsFunctional({ model, settings }: WidgetRendererProps<StandingsViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const config = parseFunctionalSettings(settings);
  const broadcast = config.templateId === "broadcast";
  const session = model.sessionLabel.toLowerCase();
  const paceSession = session === "practice" || session === "qualifying";
  const sessionLabel = session === "race" || session === "practice" || session === "qualifying" ? labels[session] : model.sessionLabel;
  const columns = model.columns;
  const identitySpan = resolveFunctionalIdentitySpan(columns);
  const hasHeader = config.showSessionHeader;
  const infoPlacement = resolveFunctionalHeaderInfoPlacement(columns, config);
  const splitHeader = infoPlacement === "split";
  const unavailable = model.status === "disconnected" || model.status === "missing" || model.status === "error";
  const externalHeader = !identitySpan || unavailable || broadcast || model.rows.length === 0;
  const statusText = model.status !== "ready" ? labels[model.status] : model.rows.length === 0 ? labels.missing : undefined;
  const labelFor = (metric: string) => metric === "gap" && paceSession ? labels.paceGap : labels[metric as keyof typeof labels] ?? metric;
  const headerInfo = <SessionInfo className="vf-header-info" choices={[config.headerFirst, config.headerSecond]} model={model} labels={labels} />;

  const sessionHeader = <div className="vf-session" title={`${sessionLabel} · ${labels.remaining}`}>
    <span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span>
    <span className="vf-session-context"><span className="vf-session-type" role={model.status === "stale" ? "status" : undefined}>{model.status === "stale" ? labels.stale : sessionLabel}</span><span className="vf-clock">{model.remainingText}</span></span>
    <span className="vf-class" title={model.activeClass}>{model.activeClass}</span>
    {infoPlacement === "inline" && headerInfo}
  </div>;

  return (
    <section className="vf-standings" data-widget-system="vantare-functional" data-widget-renderer="standings" data-template={broadcast ? "broadcast" : "signature"} data-session-header={hasHeader} data-status={model.status} data-session={session} data-flag={model.status === "ready" ? model.flag ?? "unknown" : "unknown"}>
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
                return <td key={column.id} data-metric={column.metricId} data-identity={IDENTITY.has(column.metricId) || undefined} aria-label={`${labelFor(column.metricId)}: ${value}`} style={{ textAlign: column.style?.align ?? (column.metricId === "driverName" ? "left" : IDENTITY.has(column.metricId) ? "center" : "right") }}>
                  {column.metricId === "driverName" ? <span className="vf-driver"><span className="vf-driver-name" title={value}>{value}</span>{row.isPlayer && <small>{labels.you}</small>}</span> :
                    column.metricId === "pit" ? <span title={value} className={row.pitText ? "vf-pit" : undefined}>{value}</span> : <span title={value} className={`vf-cell-value${seconds ? " vf-gap-number" : ""}`}>{seconds ? <>{seconds[1]}<small className="vf-time-unit">{seconds[2]}</small></> : value}</span>}
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      )}
      {config.showSessionFooter && <SessionInfo className="vf-session-footer" choices={[config.footerFirst, config.footerSecond]} model={model} labels={labels} />}
    </section>
  );
}
