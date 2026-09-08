import { useId, type CSSProperties, type RefObject } from "react";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import { groupRowsByClass } from "./standings-endurance-shared";
import { parseStandingsEnduranceSettings } from "./standings-endurance-settings";
import "./standings-redline-tower.css";
import { REDLINE_TOWER_ROW_HEIGHTS } from "./standings-endurance-layout";

/** Pure productive composition: shared by Studio, Desktop, OBS and Workshop. */
export function StandingsRedlineTower({ model, settings, showSessionHeader, rootRef }: {
  model: StandingsViewModel;
  settings: Readonly<Record<string, unknown>>;
  showSessionHeader: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const clipId = useId().replaceAll(":", "");
  const header = parseStandingsEnduranceSettings(settings).redlineHeader;
  return <div ref={rootRef} className="ven-tower" data-session-mode={model.sessionLabel.toLowerCase()}>
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}><defs>
      <clipPath id={`${clipId}-brand`} clipPathUnits="objectBoundingBox"><path d="M0 0 H1 V.72 Q1 .79 .95 .84 L.84 .95 Q.79 1 .72 1 H0 Z" /></clipPath>
      <clipPath id={`${clipId}-header`} clipPathUnits="objectBoundingBox"><path d="M0 0 H1 V.72 Q1 .79 .99 .84 L.967 .95 Q.957 1 .942 1 H0 Z" /></clipPath>
    </defs></svg>
    {showSessionHeader && <header className="ven-tower-header" style={{ clipPath: `url(#${clipId}-header)` }}>
      {header === "current" && <div className="ven-tower-wordmark" aria-label="Vantare Redline" />}
      {header === "signature" && <div className="ven-tower-signature"><small>VANTARE</small><strong>REDLINE</strong></div>}
      {header === "session" && <div className="ven-tower-race"><strong>{model.sessionLabel}</strong><small>VANTARE / REDLINE</small></div>}
      {header === "compact" && <div className="ven-tower-compact"><strong>VANTARE</strong><small>ENDURANCE / REDLINE</small></div>}
      <div className="ven-tower-session"><span className={`ven-tower-session-label${header === "session" ? " ven-tower-time-label" : ""}`}>{header === "session" ? "TIEMPO" : model.sessionLabel}</span><time className="ven-tower-clock">{model.remainingText}</time></div>
    </header>}
    {model.statusMessage && <p className="ven-status-message" role="status">{model.statusMessage}</p>}
    {groupRowsByClass(model.rows).map((group) => <div key={group.vehicleClass} data-class-block={group.vehicleClass}>
      <div className="ven-tower-category" data-class-header={group.vehicleClass}><span className="ven-tower-category-name">{group.vehicleClass}</span><span className="ven-tower-gap-heading">GAP</span></div>
      <ol className="ven-tower-rows">
        {group.rows.map((row, index) => <li key={row.id} className="ven-tower-row" data-standings-row={row.id} data-player={row.isPlayer ? "true" : undefined} aria-current={row.isPlayer ? "true" : undefined}
          style={{ height: REDLINE_TOWER_ROW_HEIGHTS[index % 12] } as CSSProperties}>
          <span className="ven-tower-position" data-metric="position">{row.classPosition ?? row.position}</span>
          <span className="ven-tower-manufacturer" data-manufacturer={row.manufacturer} role={row.manufacturer ? "img" : undefined} aria-label={row.manufacturer || undefined} style={{ clipPath: `url(#${clipId}-brand)` }} />
          <span className="ven-tower-number" data-metric="driverNumber">{row.driverNumber}</span>
          <span className="ven-tower-driver" data-metric="driverName" title={row.driverName}>{row.configuredDriverName ?? row.driverName}</span>
          <span className="ven-tower-gap" data-metric="gap">{row.pitText || (row.gapText === "Leader" ? "LEAD" : /^\+[\d.]+s$/.test(row.gapText) ? `+${parseFloat(row.gapText).toFixed(1)}` : row.gapText)}</span>
        </li>)}
      </ol>
    </div>)}
    <footer className="ven-tower-footer"><span>{model.trackName}</span><span className="ven-tower-pagination">{model.rows.length}{model.totalRows !== undefined ? ` / ${model.totalRows}` : ""}</span></footer>
  </div>;
}
