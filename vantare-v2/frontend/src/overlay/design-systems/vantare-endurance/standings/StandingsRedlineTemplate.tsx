import { useRef, type CSSProperties, type ReactNode } from "react";
import { resolveColumnWidthPixels, type WidgetColumnV3 } from "../../../widget-types/shared/widget-column";
import {
  nearestWidthPreset,
  STANDINGS_COLUMN_TEMPLATES,
} from "../../../widget-types/standings/standings-content";
import type {
  StandingsRowViewModel,
  StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import { resolveStandingsCellValue } from "../../../widget-types/standings/standings-view-model";
import {
  findSessionBestLapSeconds,
  groupRowsByClass,
  lapTextToSeconds,
} from "./standings-endurance-shared";
import { useStandingsMotion, type BattleState, type TireReveal } from "./useStandingsMotion";

/** "HH:MM:SS" / "MM:SS" → seconds, or null when the text is not a countdown. */
function remainingSecondsFromText(remainingText: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(remainingText.trim());
  if (!match) {
    return null;
  }
  const hours = match[1] ? Number(match[1]) : 0;
  return hours * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const FINAL_MINUTES_SECONDS = 5 * 60;
const REDLINE_FIXED_METRICS = new Set(["position", "driverName"]);
const DELTA_TRACK_PX = 44;
const ROW_GAP_PX = 8;
const ROW_HORIZONTAL_PADDING_PX = 16;
const BLOCK_HORIZONTAL_PADDING_PX = 18;

function columnFallbackWidth(metricId: string): number {
  return STANDINGS_COLUMN_TEMPLATES.find((template) => template.metricId === metricId)?.defaultWidth ?? 60;
}

function columnWidth(column: WidgetColumnV3 | undefined, metricId: string): number {
  const fallback = columnFallbackWidth(metricId);
  if (column) return resolveColumnWidthPixels(column, fallback);
  return resolveColumnWidthPixels(
    { id: metricId, metricId, enabled: true, widthPreset: nearestWidthPreset(fallback) },
    fallback,
  );
}

function justifyForAlign(align: "left" | "center" | "right"): CSSProperties["justifyContent"] {
  return align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
}

function justifySelfForAlign(align: "left" | "center" | "right"): CSSProperties["justifySelf"] {
  return align === "right" ? "end" : align === "center" ? "center" : "start";
}

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

function RedlineRow({
  row,
  classPosition,
  columns,
  isSessionBest,
  positionDelta,
  tire,
  battle,
  ghost = false,
}: {
  row: StandingsRowViewModel;
  classPosition: number;
  columns: readonly WidgetColumnV3[];
  isSessionBest: boolean;
  positionDelta: number;
  tire: TireReveal | undefined;
  battle: BattleState | undefined;
  ghost?: boolean;
}) {
  const positionColumn = columns.find((column) => column.metricId === "position");
  const driverColumn = columns.find((column) => column.metricId === "driverName");
  const flexibleColumns = columns.filter((column) => !REDLINE_FIXED_METRICS.has(column.metricId));
  const tracks = [
    `${columnWidth(positionColumn, "position")}px`,
    `minmax(${columnWidth(driverColumn, "driverName")}px, 1fr)`,
    `${DELTA_TRACK_PX}px`,
    ...flexibleColumns.map((column) => `${columnWidth(column, column.metricId)}px`),
  ];
  const isLead = !ghost && classPosition === 1;
  // A dissolving battle keeps its last interval, so the cell mounts at the
  // charge it had rather than at zero. The node is new — React rebuilds this
  // subtree when the battle wrapper goes — so the exit is a keyframe, which
  // defines both its ends, and not a transition, which would have nothing to
  // travel from.
  const leavingBattle = battle?.stage === "dissolve";
  const chargedGap =
    battle && battle.behindId === row.id && battle.stage !== "seam"
      ? Math.max(0.1, Math.min(1, 1 - battle.intervalSeconds / 0.8))
      : null;

  return (
    <div
      data-standings-row={ghost ? undefined : row.id}
      data-player={!ghost && row.isPlayer ? "true" : undefined}
      data-class={row.vehicleClass || undefined}
      data-class-leader={isLead ? "true" : undefined}
      data-pit={row.pitText ? "true" : undefined}
      className={`ven-red-row${ghost ? " ven-red-ghost" : ""}`}
      style={{ gridTemplateColumns: tracks.join(" ") }}
    >
      <span className="ven-red-pos" data-metric="position">{ghost ? "—" : classPosition}</span>
      <span
        className="ven-red-id"
        data-metric="driverName"
        style={{
          justifyContent: justifyForAlign(driverColumn?.style?.align ?? "left"),
          textAlign: driverColumn?.style?.align ?? "left",
        }}
      >
        <span className="ven-red-name">
          {initialSurname(row.configuredDriverName ?? row.driverName)}
        </span>
      </span>
      <span
        key={positionDelta}
        className="ven-red-delta"
        data-trend={positionDelta > 0 ? "up" : positionDelta < 0 ? "down" : undefined}
      >
        {positionDelta > 0 ? `+${positionDelta}` : positionDelta < 0 ? String(positionDelta) : ""}
      </span>
      {flexibleColumns.map((column) => {
        const align = column.style?.align ?? "left";
        const cellStyle = { textAlign: align } as CSSProperties;
        const flexCellStyle = {
          ...cellStyle,
          justifyContent: justifyForAlign(align),
        } as CSSProperties;
        if (column.metricId === "bestLap") {
          return <span key={column.id} className="ven-red-best" data-metric="bestLap" data-session-best={!ghost && isSessionBest ? "true" : undefined} style={flexCellStyle}>
            {row.bestLapText || "—"}
            {!ghost && isSessionBest ? <FastestGlyph /> : null}
          </span>;
        }
        if (column.metricId === "gap") {
          return <span key={column.id} className="ven-red-gap" data-metric="gap" data-pit={row.pitText ? "true" : undefined} data-charged={!ghost && chargedGap !== null ? "true" : undefined} data-leaving={!ghost && leavingBattle ? "true" : undefined} style={flexCellStyle}>
            {!ghost && chargedGap !== null ? <b style={{ width: `${Math.round(chargedGap * 100)}%` } as CSSProperties} /> : null}
            <span className="ven-red-gaptext">{ghost ? "OUT" : row.pitText ? "PIT" : isLead ? "INT" : gapOneDecimal(row.gapText)}</span>
          </span>;
        }
        if (column.metricId === "interval") {
          return <span key={column.id} className="ven-red-metric ven-red-interval" data-metric="interval" data-pit={row.pitText ? "true" : undefined} style={cellStyle}>{ghost ? "OUT" : row.pitText ? "PIT" : row.intervalText || "—"}</span>;
        }
        if (column.metricId === "tireCompound") {
          const compound = tire?.compound || row.tireCompound;
          const letter = compound.trim()[0]?.toUpperCase() || "—";
          return <span key={column.id} className={`ven-red-metric ven-red-tire-cell${!ghost && tire ? " ven-red-tire" : ""}`} data-metric="tireCompound" data-compound={letter === "—" ? undefined : letter} data-leaving={!ghost && tire?.leaving ? "true" : undefined} style={{ textAlign: "center", justifySelf: justifySelfForAlign(align) }}>{letter}</span>;
        }
        const value = column.metricId === "driverNumber"
          ? row.driverNumber ? `#${row.driverNumber}` : "—"
          : column.metricId === "pit" && ghost
            ? "OUT"
            : resolveStandingsCellValue(row, column.metricId) || "—";
        return <span key={column.id} className={`ven-red-metric ven-red-${column.metricId}`} data-metric={column.metricId} data-pit={column.metricId === "pit" && row.pitText ? "true" : undefined} style={cellStyle}>{value}</span>;
      })}
    </div>
  );
}

/**
 * Redline: the flagship Vantare direction with its motion engine. Spec:
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const motion = useStandingsMotion(model, model.status === "ready", rootRef);
  const sessionBest = findSessionBestLapSeconds(model.rows);
  const groups = groupRowsByClass(model.rows);
  const flexibleColumns = model.columns.filter((column) => !REDLINE_FIXED_METRICS.has(column.metricId));
  const positionColumn = model.columns.find((column) => column.metricId === "position");
  const driverColumn = model.columns.find((column) => column.metricId === "driverName");
  const requiredWidth = Math.max(
    420,
    columnWidth(positionColumn, "position") +
      columnWidth(driverColumn, "driverName") +
      DELTA_TRACK_PX +
      flexibleColumns.reduce((sum, column) => sum + columnWidth(column, column.metricId), 0) +
      ROW_GAP_PX * (2 + flexibleColumns.length) +
      ROW_HORIZONTAL_PADDING_PX +
      BLOCK_HORIZONTAL_PADDING_PX,
  );
  const battleByAhead = new Map(motion.battles.map((battle) => [battle.aheadId, battle]));
  const remainingSeconds = remainingSecondsFromText(model.remainingText);
  const isFinalMinutes =
    remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= FINAL_MINUTES_SECONDS;
  const ghostsByClass = new Map<string, typeof motion.ghosts[number][]>();
  for (const ghost of motion.ghosts) {
    const bucket = ghostsByClass.get(ghost.vehicleClass) ?? [];
    bucket.push(ghost);
    ghostsByClass.set(ghost.vehicleClass, bucket);
  }
  let ghostBudget = 1;

  return (
    <div ref={rootRef} className="ven-red-root" style={{ minWidth: requiredWidth }}>
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      {groups.map((group, groupIndex) => {
        const rendered: ReactNode[] = [];
        for (let index = 0; index < group.rows.length; index += 1) {
          const row = group.rows[index]!;
          const next = group.rows[index + 1];
          const battle = battleByAhead.get(row.id);
          const renderRow = (target: StandingsRowViewModel, position: number) => {
            const bestSeconds = lapTextToSeconds(target.bestLapText);
            return (
              <RedlineRow
                key={target.id}
                row={target}
                classPosition={position}
                columns={model.columns}
                isSessionBest={sessionBest !== null && bestSeconds === sessionBest}
                positionDelta={motion.positionDeltas.get(target.id) ?? 0}
                tire={motion.tires.get(target.id)}
                battle={battle && battle.behindId === target.id ? battle : undefined}
              />
            );
          };
          if (battle && next && battle.behindId === next.id) {
            rendered.push(
              <div key={`battle-${row.id}`} className="ven-red-battle" data-stage={battle.stage}>
                {renderRow(row, index + 1)}
                <div className="ven-red-seam">
                  <span>{battle.intervalSeconds.toFixed(1)}</span>
                </div>
                {renderRow(next, index + 2)}
              </div>,
            );
            index += 1;
          } else {
            rendered.push(renderRow(row, index + 1));
          }
        }
        // The layout reserves one transient row across the complete widget.
        // Rendering more would exceed it before the 640 ms ghosts leave.
        const visibleGhosts = (ghostsByClass.get(group.vehicleClass) ?? []).slice(0, ghostBudget);
        ghostBudget -= visibleGhosts.length;
        for (const ghost of visibleGhosts) {
          rendered.splice(
            Math.min(ghost.classIndex, rendered.length),
            0,
            <RedlineRow
              key={`ghost-${ghost.row.id}`}
              row={ghost.row}
              classPosition={ghost.classIndex + 1}
              columns={model.columns}
              isSessionBest={false}
              positionDelta={0}
              tire={undefined}
              battle={undefined}
              ghost
            />,
          );
        }
        return (
          <div
            key={group.vehicleClass || "all"}
            className="ven-red-block"
            data-class-block={group.vehicleClass || "—"}
          >
            {showSessionHeader && groupIndex === 0 ? (
              <div className="ven-red-slots">
                <span className="ven-red-slot" data-accent="true" data-final={isFinalMinutes ? "true" : undefined}>
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
            {rendered}
          </div>
        );
      })}
    </div>
  );
}
