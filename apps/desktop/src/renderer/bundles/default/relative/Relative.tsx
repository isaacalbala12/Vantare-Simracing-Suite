import React from 'react';
import { GlassPanel, PositionBadge, TelemetryBar, useTheme } from '@vantare/ui-core';
import type { Telemetry, VehicleData } from '@vantare/sim-core';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RelativeProps {
  telemetry: Telemetry | null;
}

interface RelativeRow {
  vehicle: VehicleData;
  /** Time difference to the player in seconds.
   *  Negative ⇒ car is ahead of the player.
   *  Positive ⇒ car is behind the player.
   *  0 ⇒ player row. */
  gapToPlayer: number;
  isPlayer: boolean;
  isDnf: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const ROWS_AHEAD = 3;
const ROWS_BEHIND = 3;
const TOTAL_ROWS = ROWS_AHEAD + 1 + ROWS_BEHIND; // 7
const LONG_NAME_THRESHOLD = 25;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatGap(seconds: number): string {
  if (Math.abs(seconds) < 0.05) return '—';
  const sign = seconds > 0 ? '+' : '−';
  return `${sign}${Math.abs(seconds).toFixed(1)}s`;
}

/** Pick the slice of vehicles to display: ROWS_AHEAD cars ahead of the player,
 *  the player, and ROWS_BEHIND cars behind. When the window would go past the
 *  edge of the field, slide it backwards to keep exactly TOTAL_ROWS rows. */
function pickRows(vehicles: VehicleData[]): RelativeRow[] {
  const sorted = [...vehicles].sort((a, b) => a.position - b.position);
  const playerIdx = sorted.findIndex((v) => v.isPlayer);
  if (playerIdx < 0) return [];

  const player = sorted[playerIdx];

  const start = Math.max(
    0,
    Math.min(playerIdx - ROWS_AHEAD, sorted.length - TOTAL_ROWS),
  );
  const end = start + TOTAL_ROWS;
  const window = sorted.slice(start, Math.min(end, sorted.length));

  return window.map((v) => {
    // gap (from seeder) is the time behind P1 for non-player cars.
    // Player is treated as the reference point (gap 0).
    // Cars ahead of player (lower position) → negative gap-to-player.
    // Cars behind player (higher position) → positive gap-to-player.
    let gapToPlayer = 0;
    if (!v.isPlayer) {
      gapToPlayer = v.position < player.position ? -v.gap : v.gap;
    }

    // DNF proxy: car is in the pits AND has no recorded best lap.
    // (iRacing/AC put retired cars in the pits; an in-pit car with zero
    //  best-lap time has never been actively racing.)
    const isDnf = v.isPitting && v.bestLaptime === 0;

    return {
      vehicle: v,
      gapToPlayer,
      isPlayer: v.isPlayer,
      isDnf,
    };
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Relative({ telemetry }: RelativeProps) {
  // ── Empty state ────────────────────────────────────────────────────────
  if (!telemetry || telemetry.vehicles.length === 0) {
    return (
      <div
        data-testid="relative-empty"
        className="flex items-center justify-center h-full text-white/60 text-sm"
      >
        {!telemetry ? 'No telemetry data' : 'No vehicles in session'}
      </div>
    );
  }

  const rows = pickRows(telemetry.vehicles);

  if (rows.length === 0) {
    return (
      <div
        data-testid="relative-empty"
        className="flex items-center justify-center h-full text-white/60 text-sm"
      >
        Player not found in session
      </div>
    );
  }

  // ── Theme detection ────────────────────────────────────────────────────
  const { themeId } = useTheme();
  const isF1 = themeId === 'f1';

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {isF1 && (
        <TelemetryBar
          items={[
            { label: 'Pos', value: `P${rows.find(r => r.isPlayer)?.vehicle.position ?? '?'}`, accent: true },
            { label: 'Coches', value: `${rows.length} en ventana` },
          ]}
        />
      )}
      <GlassPanel className={`relative-overlay${isF1 ? ' f1' : ''}`} data-testid="relative-table">
      <style>{`
        .relative-row {
          transition: all 0.3s ease;
        }
        .relative-row-ahead {
          background: rgba(239, 68, 68, 0.10);
        }
        .relative-row-ahead-distant {
          background: rgba(239, 68, 68, 0.04);
        }
        .relative-row-behind {
          background: rgba(34, 197, 94, 0.10);
        }
        .relative-row-behind-distant {
          background: rgba(34, 197, 94, 0.04);
        }
        .relative-row-player {
          background: rgba(196, 32, 64, 0.12);
          border-left: 3px solid #c42040;
        }
        .relative-row-player td:first-child {
          padding-left: calc(0.5rem - 3px);
        }
        .relative-row-dnf {
          opacity: 0.55;
          font-style: italic;
        }
        .relative-row-dnf td {
          text-decoration: line-through;
          text-decoration-color: rgba(255, 255, 255, 0.35);
        }
        .dnf-tag {
          display: inline-block;
          padding: 0 0.3rem;
          margin-left: 0.35rem;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.5625rem;
          font-weight: 700;
          letter-spacing: 0.08em;
        }
        .gap-cell-ahead {
          color: rgba(239, 68, 68, 0.9);
        }
        .gap-cell-behind {
          color: rgba(34, 197, 94, 0.9);
        }
        .gap-cell-zero {
          color: rgba(255, 255, 255, 0.4);
        }
      `}</style>
      <table className="relative-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>Pos</th>
            <th>Driver</th>
            <th style={{ width: 32 }}>Car</th>
            <th style={{ width: 48 }}>Class</th>
            <th style={{ width: 70 }}>Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { vehicle, gapToPlayer, isPlayer, isDnf } = row;
            const isAhead = !isPlayer && gapToPlayer < 0;
            const isBehind = !isPlayer && gapToPlayer > 0;
            const isDistant =
              !isPlayer && Math.abs(gapToPlayer) > 5; // >5s → lower opacity tint

            // Compose row className. `bg-blood` is the player accent marker
            // the design system keys off; we also keep semantic class names
            // for tests and future CSS hooks.
            let rowClass = 'relative-row transition-all duration-300';
            if (isPlayer) {
              rowClass += ' relative-row-player bg-blood';
            } else if (isAhead) {
              rowClass += isDistant
                ? ' relative-row-ahead-distant'
                : ' relative-row-ahead';
            } else if (isBehind) {
              rowClass += isDistant
                ? ' relative-row-behind-distant'
                : ' relative-row-behind';
            }
            if (isDnf) rowClass += ' relative-row-dnf';

            // Gap cell coloring matches the row tinting direction.
            const gapClass = isPlayer || Math.abs(gapToPlayer) < 0.05
              ? 'gap-cell-zero'
              : isAhead
                ? 'gap-cell-ahead'
                : 'gap-cell-behind';

            const gapText = isDnf
              ? 'OUT'
              : formatGap(gapToPlayer);

            const isLongName = vehicle.driverName.length > LONG_NAME_THRESHOLD;

            return (
              <tr
                key={vehicle.id}
                data-testid={isPlayer ? 'player-highlight' : undefined}
                className={rowClass}
              >
                <td>
                  <PositionBadge position={vehicle.position} />
                </td>
                <td>
                  <span
                    className="driver-name-cell"
                    title={isLongName ? vehicle.driverName : undefined}
                  >
                    {vehicle.driverName}
                    {isDnf && <span className="dnf-tag">OUT</span>}
                  </span>
                </td>
                <td style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {vehicle.carNumber}
                </td>
                <td>
                  <span
                    className="class-chip"
                    style={{
                      background: `${vehicle.color}22`,
                      color: vehicle.color,
                    }}
                  >
                    <span
                      className="class-dot"
                      style={{ backgroundColor: vehicle.color }}
                    />
                    {vehicle.color}
                  </span>
                </td>
                <td className={gapClass}>{gapText}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </GlassPanel>
    </>
  );
}
