import { useRef, type CSSProperties, type ReactNode } from "react";
import type {
  StandingsRowViewModel,
  StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
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
  isSessionBest,
  positionDelta,
  tire,
  battle,
}: {
  row: StandingsRowViewModel;
  classPosition: number;
  isSessionBest: boolean;
  positionDelta: number;
  tire: TireReveal | undefined;
  battle: BattleState | undefined;
}) {
  const isLead = classPosition === 1;
  const chargedGap =
    battle && battle.behindId === row.id && battle.stage !== "seam"
      ? Math.max(0.1, Math.min(1, 1 - battle.intervalSeconds / 0.8))
      : null;

  return (
    <div
      data-standings-row={row.id}
      data-player={row.isPlayer ? "true" : undefined}
      data-class={row.vehicleClass || undefined}
      data-class-leader={isLead ? "true" : undefined}
      data-pit={row.pitText ? "true" : undefined}
      className="ven-red-row"
    >
      <span className="ven-red-pos">{classPosition}</span>
      <span className="ven-red-id">
        <span className="ven-red-num">#{row.driverNumber}</span>
        <span className="ven-red-name">{initialSurname(row.driverName)}</span>
        {tire ? (
          <span
            className="ven-red-tire"
            data-compound={tire.compound.trim()[0]?.toUpperCase()}
            data-leaving={tire.leaving ? "true" : undefined}
          >
            {tire.compound.trim()[0]?.toUpperCase()}
          </span>
        ) : null}
      </span>
      <span
        key={positionDelta}
        className="ven-red-delta"
        data-trend={positionDelta > 0 ? "up" : positionDelta < 0 ? "down" : undefined}
      >
        {positionDelta > 0 ? `+${positionDelta}` : positionDelta < 0 ? String(positionDelta) : ""}
      </span>
      <span className="ven-red-best" data-session-best={isSessionBest ? "true" : undefined}>
        {row.bestLapText}
        {isSessionBest ? <FastestGlyph /> : null}
      </span>
      {chargedGap !== null ? (
        <span className="ven-red-gapcell">
          <b style={{ width: `${Math.round(chargedGap * 100)}%` } as CSSProperties} />
          <span>{gapOneDecimal(row.gapText)}</span>
        </span>
      ) : (
        <span className="ven-red-gap" data-pit={row.pitText ? "true" : undefined}>
          {row.pitText ? "PIT" : isLead ? "INT" : gapOneDecimal(row.gapText)}
        </span>
      )}
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

  return (
    <div ref={rootRef} className="ven-red-root">
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
        for (const ghost of ghostsByClass.get(group.vehicleClass) ?? []) {
          rendered.splice(
            Math.min(ghost.classIndex, rendered.length),
            0,
            <div
              key={`ghost-${ghost.row.id}`}
              className="ven-red-row ven-red-ghost"
              data-class={ghost.row.vehicleClass || undefined}
            >
              <span className="ven-red-pos">—</span>
              <span className="ven-red-id">
                <span className="ven-red-num">#{ghost.row.driverNumber}</span>
                <span className="ven-red-name">{initialSurname(ghost.row.driverName)}</span>
              </span>
              <span className="ven-red-delta" />
              <span className="ven-red-best">{ghost.row.bestLapText}</span>
              <span className="ven-red-gap">OUT</span>
            </div>,
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
