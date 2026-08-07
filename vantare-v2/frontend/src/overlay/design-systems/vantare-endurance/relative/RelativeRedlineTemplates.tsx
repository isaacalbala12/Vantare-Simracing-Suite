import type { CSSProperties, ReactNode } from "react";
import { resolveRelativeClassColor } from "../../../widget-types/relative/relative-renderer-helpers";
import type {
  RelativeRowViewModel,
  RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";
import {
  classShortLabel,
  findLappingThreat,
  initialSurname,
  isFasterClass,
  isImminent,
  proximity,
  signedGap,
} from "./relative-redline-shared";

export type RelativeRedlineVariant = "mirror" | "proximity" | "traffic";

function playerRow(model: RelativeViewModel): RelativeRowViewModel | undefined {
  return model.rows.find((row) => row.isPlayer);
}

/** Slot strip: the relative ViewModel carries no session clock, so it states who you are. */
function Slots({ model }: { model: RelativeViewModel }) {
  const player = playerRow(model);
  if (!player) {
    return null;
  }
  return (
    <div className="ven-rel-slots">
      <span className="ven-rel-slot" data-accent="true">
        <small>P</small>
        <b>{player.position}</b>
      </span>
      {player.vehicleClass ? (
        <span className="ven-rel-slot">
          <small>CLASS</small>
          <b>{classShortLabel(player.vehicleClass)}</b>
        </span>
      ) : null}
    </div>
  );
}

function ClassChip({
  row,
  playerClass,
  settings,
}: {
  row: RelativeRowViewModel;
  playerClass: string;
  settings: Readonly<Record<string, unknown>>;
}) {
  if (!row.vehicleClass) {
    return <span className="ven-rel-chip" />;
  }
  return (
    <span
      className="ven-rel-chip"
      data-faster={isFasterClass(row.vehicleClass, playerClass) ? "true" : undefined}
      style={{ "--rel-class": resolveRelativeClassColor(row.vehicleClass, settings) } as CSSProperties}
    >
      {classShortLabel(row.vehicleClass)}
    </span>
  );
}

function RowShell({
  row,
  variant,
  children,
  extra,
}: {
  row: RelativeRowViewModel;
  variant: RelativeRedlineVariant;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div
      data-relative-row={row.id}
      data-player={row.isPlayer ? "true" : undefined}
      data-tone={row.tone}
      data-class={row.vehicleClass || undefined}
      className="ven-rel-row"
      data-variant={variant}
    >
      {children}
      {extra}
    </div>
  );
}

function Identity({ row }: { row: RelativeRowViewModel }) {
  return (
    <span className="ven-rel-id">
      <span className="ven-rel-num">#{row.driverNumber}</span>
      <span className="ven-rel-name">{initialSurname(row.driverName)}</span>
    </span>
  );
}

/**
 * A — Espejo del piloto. The player is the axis: labelled light seams split the
 * block, gaps read outward in gain/loss colour, and an approach bar on the edge
 * facing the player marks whoever is within a second.
 */
function MirrorTemplate({
  model,
  settings,
}: {
  model: RelativeViewModel;
  settings: Readonly<Record<string, unknown>>;
}) {
  const player = playerRow(model);
  const playerClass = player?.vehicleClass ?? "";
  const ahead = model.rows.filter((row) => !row.isPlayer && (row.gapSeconds ?? 0) > 0);
  const behind = model.rows.filter((row) => !row.isPlayer && (row.gapSeconds ?? 0) <= 0);

  const renderRow = (row: RelativeRowViewModel, side: "ahead" | "behind") => (
    <RowShell
      key={row.id}
      row={row}
      variant="mirror"
      extra={
        isImminent(row) ? (
          <i
            className="ven-rel-approach"
            data-side={side}
            style={{ right: `${Math.round((1 - proximity(row.gapSeconds, 1)) * 55 + 20)}%` }}
          />
        ) : null
      }
    >
      <span className="ven-rel-pos">{row.position}</span>
      <Identity row={row} />
      <ClassChip row={row} playerClass={playerClass} settings={settings} />
      <span className="ven-rel-gap" data-side={side}>
        {signedGap(row)}
      </span>
    </RowShell>
  );

  return (
    <>
      {ahead.map((row) => renderRow(row, "ahead"))}
      <div className="ven-rel-axis" data-side="ahead">
        <span>ADELANTE</span>
        <i />
      </div>
      {player ? (
        <RowShell row={player} variant="mirror">
          <span className="ven-rel-pos">{player.position}</span>
          <Identity row={player} />
          <ClassChip row={player} playerClass={playerClass} settings={settings} />
          <span className="ven-rel-gap" data-you="true">
            YOU
          </span>
        </RowShell>
      ) : null}
      <div className="ven-rel-axis" data-side="behind">
        <i />
        <span>DETRÁS</span>
      </div>
      {behind.map((row) => renderRow(row, "behind"))}
    </>
  );
}

/**
 * B — Cinta de proximidad. Every gap is a charged cell that fills as the car
 * closes, so threat reads without parsing numbers. Light seams bracket the
 * player to mark the two cars in direct contention.
 */
function ProximityTemplate({
  model,
  settings,
}: {
  model: RelativeViewModel;
  settings: Readonly<Record<string, unknown>>;
}) {
  const player = playerRow(model);
  const playerClass = player?.vehicleClass ?? "";
  const playerIndex = model.rows.findIndex((row) => row.isPlayer);

  return (
    <>
      {model.rows.map((row, index) => {
        const side = (row.gapSeconds ?? 0) > 0 ? "ahead" : "behind";
        const rendered = row.isPlayer ? (
          <RowShell key={row.id} row={row} variant="proximity">
            <span className="ven-rel-pos">{row.position}</span>
            <Identity row={row} />
            <ClassChip row={row} playerClass={playerClass} settings={settings} />
            <span className="ven-rel-gap" data-you="true">
              YOU
            </span>
          </RowShell>
        ) : (
          <RowShell key={row.id} row={row} variant="proximity">
            <span className="ven-rel-pos">{row.position}</span>
            <Identity row={row} />
            <ClassChip row={row} playerClass={playerClass} settings={settings} />
            <span className="ven-rel-gapcell" data-side={side}>
              <b style={{ width: `${Math.round(proximity(row.gapSeconds) * 100)}%` }} />
              <span>{signedGap(row)}</span>
            </span>
          </RowShell>
        );
        if (playerIndex >= 0 && (index === playerIndex - 1 || index === playerIndex)) {
          return (
            <div key={`${row.id}-seam`} className="ven-rel-seamwrap">
              {rendered}
              <div className="ven-rel-seam" />
            </div>
          );
        }
        return rendered;
      })}
    </>
  );
}

/**
 * C — Torre de tráfico. Class first: a colour rail per row plus an explicit
 * warning when a quicker category is closing from behind and about to lap you.
 */
function TrafficTemplate({
  model,
  settings,
}: {
  model: RelativeViewModel;
  settings: Readonly<Record<string, unknown>>;
}) {
  const player = playerRow(model);
  const playerClass = player?.vehicleClass ?? "";
  const threat = findLappingThreat(model.rows, playerClass);

  return (
    <>
      {model.rows.map((row) => {
        const rendered = (
          <RowShell key={row.id} row={row} variant="traffic">
            <i
              className="ven-rel-rail"
              style={
                { "--rel-class": resolveRelativeClassColor(row.vehicleClass, settings) } as CSSProperties
              }
            />
            <span className="ven-rel-pos">{row.position}</span>
            <Identity row={row} />
            <ClassChip row={row} playerClass={playerClass} settings={settings} />
            <span
              className="ven-rel-gap"
              data-you={row.isPlayer ? "true" : undefined}
              data-closing={isImminent(row) ? "true" : undefined}
            >
              {row.isPlayer ? "YOU" : signedGap(row)}
            </span>
          </RowShell>
        );
        if (threat && threat.id === row.id) {
          return (
            <div key={`${row.id}-threat`}>
              <div className="ven-rel-lapnote">
                <span>
                  ◀◀ {classShortLabel(row.vehicleClass)} #{row.driverNumber} A{" "}
                  {Math.abs(row.gapSeconds ?? 0).toFixed(1)}s — TE DOBLA
                </span>
                <i />
              </div>
              {rendered}
            </div>
          );
        }
        return rendered;
      })}
    </>
  );
}

/** Redline relative: one block, three complementary readings of the same field. */
export function RelativeRedlineTemplate({
  model,
  settings,
  variant,
  showHeader,
}: {
  model: RelativeViewModel;
  settings: Readonly<Record<string, unknown>>;
  variant: RelativeRedlineVariant;
  showHeader: boolean;
}) {
  return (
    <div className="ven-rel-root">
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="ven-rel-block" data-variant={variant}>
        {showHeader ? <Slots model={model} /> : null}
        {variant === "mirror" ? <MirrorTemplate model={model} settings={settings} /> : null}
        {variant === "proximity" ? <ProximityTemplate model={model} settings={settings} /> : null}
        {variant === "traffic" ? <TrafficTemplate model={model} settings={settings} /> : null}
      </div>
    </div>
  );
}
