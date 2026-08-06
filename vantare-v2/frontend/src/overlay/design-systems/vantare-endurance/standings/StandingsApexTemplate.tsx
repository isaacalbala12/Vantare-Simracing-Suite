import type { CSSProperties } from "react";
import { resolveStandingsClassColor } from "../../../widget-types/standings/standings-renderer-helpers";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import {
  driverCode,
  findSessionBestLapSeconds,
  groupRowsByClass,
  lapTextToSeconds,
} from "./standings-endurance-shared";

/**
 * Vantare Apex: the system's signature composition. Skewed position plates,
 * class-energy edge glow, layered depth and staggered entrance — pure CSS.
 */
export function StandingsApexTemplate({
  model,
  settings,
  showSessionHeader,
}: {
  model: StandingsViewModel;
  settings: Readonly<Record<string, unknown>>;
  showSessionHeader: boolean;
}) {
  const sessionBest = findSessionBestLapSeconds(model.rows);

  return (
    <>
      {showSessionHeader ? (
        <header className="ven-apex-header">
          <span className="ven-apex-brand">VANTARE</span>
          <span className="ven-apex-session">
            {model.sessionLabel}
            <strong>{model.remainingText}</strong>
          </span>
        </header>
      ) : null}
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      {groupRowsByClass(model.rows).map((group) => (
        <div
          key={group.vehicleClass || "all"}
          className="ven-apex-block"
          data-class-block={group.vehicleClass || "—"}
          style={
            {
              "--ven-class-color": resolveStandingsClassColor(group.vehicleClass, settings),
            } as CSSProperties
          }
        >
          {group.vehicleClass ? (
            <div className="ven-apex-class-header" data-class-header={group.vehicleClass}>
              <span className="ven-apex-class-name">{group.vehicleClass}</span>
              <span className="ven-apex-class-count">{group.rows.length}</span>
            </div>
          ) : null}
          {group.rows.map((row, index) => {
            const bestSeconds = lapTextToSeconds(row.bestLapText);
            const isSessionBest = sessionBest !== null && bestSeconds === sessionBest;
            return (
              <div
                key={row.id}
                data-standings-row={row.id}
                data-player={row.isPlayer ? "true" : undefined}
                data-class={row.vehicleClass || undefined}
                data-class-leader={index === 0 ? "true" : undefined}
                data-pit={row.pitText ? "true" : undefined}
                className="ven-apex-row"
                style={
                  {
                    "--ven-class-color": resolveStandingsClassColor(row.vehicleClass, settings),
                    "--ven-apex-delay": `${index * 45}ms`,
                  } as CSSProperties
                }
              >
                <span className="ven-apex-pos">
                  <span className="ven-apex-pos-value">{index + 1}</span>
                </span>
                <span className="ven-apex-id">
                  <span className="ven-apex-code">{driverCode(row.driverName)}</span>
                  <span className="ven-apex-name">{row.driverName}</span>
                </span>
                {row.pitText ? <span className="ven-apex-pit">{row.pitText}</span> : null}
                <span className="ven-apex-best" data-session-best={isSessionBest ? "true" : undefined}>
                  {row.bestLapText}
                </span>
                <span className="ven-apex-gap">{index === 0 ? "LEADER" : row.gapText}</span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
