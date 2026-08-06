import type { CSSProperties } from "react";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import {
  findSessionBestLapSeconds,
  groupRowsByClass,
  lapTextToSeconds,
} from "./standings-endurance-shared";

/** Racelabs look: split panel (opaque list + glass data columns), team stripe, khaki player row, purple session best. */
export function StandingsRacelabsTemplate({
  model,
  showSessionHeader,
}: {
  model: StandingsViewModel;
  settings: Readonly<Record<string, unknown>>;
  showSessionHeader: boolean;
}) {
  const sessionBest = findSessionBestLapSeconds(model.rows);

  const gapOneDecimal = (gapText: string): string => {
    const value = Number.parseFloat(gapText.replace(/[^\d.-]/g, ""));
    return Number.isFinite(value) ? value.toFixed(1) : gapText;
  };
  const padLap = (lapText: string): string => lapText.replace(/^(\d):/, "0$1:");

  return (
    <>
      {showSessionHeader ? (
        <header className="ven-rl-header">
          <span className="ven-rl-session">
            {model.sessionLabel} <strong>{model.remainingText}</strong>
          </span>
          <span className="ven-rl-col-label ven-rl-col-gap">Gap</span>
          <span className="ven-rl-col-label ven-rl-col-fastest">Fastest</span>
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
          className="ven-rl-block"
          data-class-block={group.vehicleClass || "—"}
        >
          {group.rows.map((row, index) => {
            const bestSeconds = lapTextToSeconds(row.bestLapText);
            const isSessionBest = sessionBest !== null && bestSeconds === sessionBest;
            return (
              <div
                key={row.id}
                data-standings-row={row.id}
                data-player={row.isPlayer ? "true" : undefined}
                data-class={row.vehicleClass || undefined}
                data-pit={row.pitText ? "true" : undefined}
                data-even={index % 2 === 1 ? "true" : undefined}
                className="ven-rl-row"
                style={
                  {
                    "--ven-team-color": row.teamBrandColor || undefined,
                  } as CSSProperties
                }
              >
                <span className="ven-rl-pos">{index + 1}</span>
                <span className="ven-rl-stripe" aria-hidden="true" />
                <span className="ven-rl-name">
                  {row.driverName}
                  {row.pitText ? <span className="ven-rl-pit">{row.pitText}</span> : null}
                </span>
                <span className="ven-rl-gap">{index === 0 ? "-" : gapOneDecimal(row.gapText)}</span>
                <span className="ven-rl-fastest" data-session-best={isSessionBest ? "true" : undefined}>
                  {padLap(row.bestLapText)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
