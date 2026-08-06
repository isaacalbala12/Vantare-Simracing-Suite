import type { CSSProperties } from "react";
import { resolveStandingsClassColor } from "../../../widget-types/standings/standings-renderer-helpers";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import {
  driverCode,
  findSessionBestLapSeconds,
  groupRowsByClass,
  lapTextToSeconds,
} from "./standings-endurance-shared";

function formatNeoGap(gapText: string): string {
  const value = Number.parseFloat(gapText.replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? `+${value.toFixed(1)}` : gapText;
}

/**
 * Vantare Neo: premium dark-neumorphism philosophy. One material (#1b1e26),
 * depth via dual soft shadows: raised chips for identity, inset wells for data,
 * class colors as soft light — never as flat blocks.
 */
export function StandingsNeoTemplate({
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
        <header className="ven-neo-header">
          <span className="ven-neo-brand">VANTARE</span>
          <span className="ven-neo-clock">
            <span className="ven-neo-clock-label">{model.sessionLabel}</span>
            {model.remainingText}
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
          className="ven-neo-card"
          data-class-block={group.vehicleClass || "—"}
          style={
            {
              "--neo-class": resolveStandingsClassColor(group.vehicleClass, settings),
            } as CSSProperties
          }
        >
          {group.vehicleClass ? (
            <div className="ven-neo-class" data-class-header={group.vehicleClass}>
              <span className="ven-neo-class-dot" aria-hidden="true" />
              <span className="ven-neo-class-name">{group.vehicleClass}</span>
              <span className="ven-neo-class-count">{group.rows.length}</span>
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
                className="ven-neo-row"
              >
                <span className="ven-neo-pos">{index + 1}</span>
                <span className="ven-neo-id">
                  <span className="ven-neo-code">{driverCode(row.driverName)}</span>
                  <span className="ven-neo-name">{row.driverName}</span>
                </span>
                <span className="ven-neo-best" data-session-best={isSessionBest ? "true" : undefined}>
                  {row.bestLapText}
                </span>
                <span className="ven-neo-gap" data-pit={row.pitText ? "true" : undefined}>
                  {row.pitText ? "PIT" : index === 0 ? "LEAD" : formatNeoGap(row.gapText)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
