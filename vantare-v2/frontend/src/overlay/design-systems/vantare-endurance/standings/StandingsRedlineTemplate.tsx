import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import {
  findSessionBestLapSeconds,
  groupRowsByClass,
  lapTextToSeconds,
} from "./standings-endurance-shared";

function initialSurname(driverName: string): string {
  const words = driverName
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) {
    return driverName;
  }
  return `${words[0]![0]}. ${words.slice(1).join(" ")}`;
}

function gapOneDecimal(gapText: string): string {
  const value = Number.parseFloat(gapText.replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? `+${value.toFixed(1)}` : gapText;
}

/** Purple stopwatch glyph for the session-best holder (self-contained inline SVG). */
function FastestGlyph() {
  return (
    <svg className="ven-red-fastest" viewBox="0 0 12 14" aria-hidden="true">
      <rect x="4.5" y="0" width="3" height="2" rx="0.5" fill="currentColor" />
      <circle cx="6" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 8 L8.4 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Redline: the flagship Vantare direction. Graphite soft-card blocks, carmine
 * signature (positions, player ambient, primary slot), inverted class leader,
 * info slots as plain text in the top zone. Spec:
 * docs/overlays-studio/vantare-flagship-direction.md
 */
export function StandingsRedlineTemplate({
  model,
  showSessionHeader,
}: {
  model: StandingsViewModel;
  settings: Readonly<Record<string, unknown>>;
  showSessionHeader: boolean;
}) {
  const sessionBest = findSessionBestLapSeconds(model.rows);
  const groups = groupRowsByClass(model.rows);

  return (
    <>
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      {groups.map((group, groupIndex) => (
        <div
          key={group.vehicleClass || "all"}
          className="ven-red-block"
          data-class-block={group.vehicleClass || "—"}
        >
          {showSessionHeader && groupIndex === 0 ? (
            <div className="ven-red-slots">
              <span className="ven-red-slot" data-accent="true">
                <small>{model.sessionLabel}</small>
                <b>{model.remainingText}</b>
              </span>
              {model.lapText ? (
                <span className="ven-red-slot">
                  <small>LAP</small>
                  <b>{model.lapText}</b>
                </span>
              ) : null}
            </div>
          ) : null}
          {group.vehicleClass ? (
            <div className="ven-red-cls" data-class-header={group.vehicleClass}>
              <span className="ven-red-chip">{group.vehicleClass}</span>
              <em>{group.rows.length}</em>
            </div>
          ) : null}
          {group.rows.map((row, index) => {
            const bestSeconds = lapTextToSeconds(row.bestLapText);
            const isSessionBest = sessionBest !== null && bestSeconds === sessionBest;
            const isLead = index === 0;
            return (
              <div
                key={row.id}
                data-standings-row={row.id}
                data-player={row.isPlayer ? "true" : undefined}
                data-class={row.vehicleClass || undefined}
                data-class-leader={isLead ? "true" : undefined}
                data-pit={row.pitText ? "true" : undefined}
                className="ven-red-row"
              >
                <span className="ven-red-pos">{index + 1}</span>
                <span className="ven-red-id">
                  <span className="ven-red-num">#{row.driverNumber}</span>
                  <span className="ven-red-name">{initialSurname(row.driverName)}</span>
                </span>
                <span className="ven-red-delta" />
                <span className="ven-red-best" data-session-best={isSessionBest ? "true" : undefined}>
                  {row.bestLapText}
                  {isSessionBest ? <FastestGlyph /> : null}
                </span>
                <span className="ven-red-gap" data-pit={row.pitText ? "true" : undefined}>
                  {row.pitText ? "PIT" : isLead ? "INT" : gapOneDecimal(row.gapText)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
