import type { CSSProperties } from "react";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import { capGroupRows, driverCode, groupRowsByClass } from "./standings-endurance-shared";

const WEC_ROWS_PER_CLASS = 8;

/** WEC broadcast class-bar palette (crimson Hypercar, blue LMP2, green GT). */
const WEC_CLASS_BAR: Record<string, string> = {
  HYPERCAR: "linear-gradient(90deg, #c50a0c 0%, #a80607 55%, #660201 100%)",
  LMP2: "linear-gradient(90deg, #0a48c0 0%, #0637a0 55%, #021e66 100%)",
  LMP3: "linear-gradient(90deg, #0a8ba6 0%, #077187 55%, #023f4e 100%)",
  GT3: "linear-gradient(90deg, #02741f 0%, #02631b 55%, #013a07 100%)",
  LMGT3: "linear-gradient(90deg, #02741f 0%, #02631b 55%, #013a07 100%)",
};

function classBar(vehicleClass: string): string {
  return WEC_CLASS_BAR[vehicleClass.toUpperCase()] ?? WEC_CLASS_BAR.HYPERCAR;
}

/** Faithful WEC timing tower: navy panel, beveled class bars, team-colored number plates, gap pills. */
export function StandingsWecTemplate({
  model,
  showSessionHeader,
}: {
  model: StandingsViewModel;
  settings: Readonly<Record<string, unknown>>;
  showSessionHeader: boolean;
}) {
  return (
    <>
      {showSessionHeader ? (
        <header className="ven-wec-header">
          <span className="ven-wec-logo">VANTARE</span>
          <span className="ven-wec-clock">{model.remainingText}</span>
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
          className="ven-wec-block"
          data-class-block={group.vehicleClass || "—"}
        >
          {group.vehicleClass ? (
            <div
              className="ven-wec-class-header"
              data-class-header={group.vehicleClass}
              style={{ background: classBar(group.vehicleClass) }}
            >
              {group.vehicleClass}
            </div>
          ) : null}
          {capGroupRows(group.rows, WEC_ROWS_PER_CLASS).map(({ row, classPosition }, index) => (
            <div
              key={row.id}
              data-standings-row={row.id}
              data-player={row.isPlayer ? "true" : undefined}
              data-class={row.vehicleClass || undefined}
              data-class-leader={classPosition === 1 ? "true" : undefined}
              data-pit={row.pitText ? "true" : undefined}
              data-even={index % 2 === 1 ? "true" : undefined}
              className="ven-wec-row"
              style={
                {
                  "--ven-team-color": row.teamBrandColor || undefined,
                } as CSSProperties
              }
            >
              <span className="ven-wec-pos">{classPosition}</span>
              <span className="ven-wec-team" aria-hidden="true" />
              <span className="ven-wec-number">{row.driverNumber}</span>
              <span className="ven-wec-divider" aria-hidden="true" />
              <span className="ven-wec-code">{driverCode(row.driverName)}</span>
              <span className="ven-wec-gap">
                {row.pitText
                  ? row.pitText
                  : classPosition === 1
                    ? "INTERVAL"
                    : (row.intervalText !== "—" ? row.intervalText : row.gapText).replace(/s$/, "")}
              </span>
            </div>
          ))}
        </div>
      ))}
      <footer className="ven-wec-footer">{model.sessionLabel}</footer>
    </>
  );
}
