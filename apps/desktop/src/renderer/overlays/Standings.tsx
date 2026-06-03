import React from 'react';
import { GlassPanel, TimeDisplay, PositionBadge } from '@vantare/ui-core';
import type { Telemetry, VehicleData } from '@vantare/sim-core';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StandingsProps {
  telemetry: Telemetry | null;
  maxRows?: number;
}

interface EnrichedVehicle extends VehicleData {
  gapToAhead: number | null; // null for P1 (LEADER)
  intervalFromPlayer: number; // positive = car ahead, negative = behind
  cumulativeGap: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatGap(seconds: number): string {
  return `+${seconds.toFixed(1)}s`;
}

const LONG_NAME_THRESHOLD = 25;

// ── Component ──────────────────────────────────────────────────────────────

export default function Standings({ telemetry, maxRows = 20 }: StandingsProps) {
  // ── Empty state ────────────────────────────────────────────────────────
  if (!telemetry || telemetry.vehicles.length === 0) {
    return (
      <div data-testid="standings-empty" className="flex items-center justify-center h-full text-white/60 text-sm">
        {!telemetry ? 'No telemetry data' : 'No vehicles in session'}
      </div>
    );
  }

  // ── Sort vehicles by position (ascending) ──────────────────────────────
  const sorted = [...telemetry.vehicles].sort((a, b) => a.position - b.position);

  // ── Enrich vehicles with computed fields ───────────────────────────────
  let playerIdx = -1;
  const enriched: EnrichedVehicle[] = sorted.map((v, i) => {
    return {
      ...v,
      gapToAhead: v.position === 1 ? null : v.gap,
      cumulativeGap: 0,
      intervalFromPlayer: 0,
    };
  });

  // Compute cumulative gaps (sum of gap-to-ahead from P1)
  let cumGap = 0;
  enriched.forEach((v, i) => {
    cumGap += i === 0 ? 0 : (v.gap ?? 0);
    v.cumulativeGap = cumGap;
    if (v.isPlayer) playerIdx = i;
  });

  // Compute interval from player
  if (playerIdx >= 0) {
    const playerCumGap = enriched[playerIdx].cumulativeGap;
    enriched.forEach((v) => {
      v.intervalFromPlayer = playerCumGap - v.cumulativeGap;
    });
  }

  // ── Detect classes from color ──────────────────────────────────────────
  const classColors = [...new Set(sorted.map((v) => v.color))].filter(Boolean);

  // ── Slice to max rows ──────────────────────────────────────────────────
  const displayVehicles = enriched.slice(0, maxRows);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <GlassPanel className="standings-overlay" data-testid="standings-table">
      <style>{`
        .standings-overlay {
          max-height: 100%;
          overflow: hidden;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .standings-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.6875rem;
          line-height: 1.3;
        }
        .standings-table th {
          text-align: left;
          padding: 0.375rem 0.5rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.5);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
          font-size: 0.625rem;
        }
        .standings-table td {
          padding: 0.3125rem 0.5rem;
          white-space: nowrap;
          vertical-align: middle;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          transition: background-color 0.2s ease;
        }
        .standings-table tr:last-child td {
          border-bottom: none;
        }
        .standings-row-player {
          background: rgba(139, 0, 0, 0.2);
          border-left: 3px solid #DC143C;
          position: relative;
        }
        .standings-row-player td:first-child {
          padding-left: calc(0.5rem - 3px);
        }
        .standings-row-even {
          background: rgba(255, 255, 255, 0.02);
        }
        .standings-row-class-gt3 {
          background: rgba(225, 6, 0, 0.06);
        }
        .standings-row-class-gte {
          background: rgba(0, 210, 190, 0.06);
        }
        .class-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.0625rem 0.375rem;
          border-radius: 3px;
          font-size: 0.5625rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .class-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }
        .driver-name {
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: inline-block;
          vertical-align: middle;
        }
        .text-leader {
          color: #fbbf24;
          font-weight: 600;
        }
        .text-interval-ahead {
          color: rgba(34, 197, 94, 0.9);
        }
        .text-interval-behind {
          color: rgba(239, 68, 68, 0.9);
        }
        .text-interval-zero {
          color: rgba(255, 255, 255, 0.4);
        }
      `}</style>
      <table className="standings-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>Pos</th>
            <th>Driver</th>
            <th style={{ width: 32 }}>Car</th>
            {classColors.length > 1 && <th style={{ width: 48 }}>Class</th>}
            <th style={{ width: 56 }}>Gap</th>
            <th style={{ width: 70 }}>Last Lap</th>
            <th style={{ width: 70 }}>Best Lap</th>
            <th style={{ width: 60 }}>Interval</th>
          </tr>
        </thead>
        <tbody>
          {displayVehicles.map((vehicle, idx) => {
            const isEven = idx % 2 === 0;
            const rowClass = vehicle.isPlayer
              ? 'standings-row-player'
              : isEven
                ? 'standings-row-even'
                : '';

            const intervalDisplay = (() => {
              if (vehicle.isPlayer) return <span className="text-interval-zero">—</span>;
              const secs = Math.abs(vehicle.intervalFromPlayer);
              if (secs < 0.1) return <span className="text-interval-zero">—</span>;
              const label = vehicle.intervalFromPlayer > 0 ? 'ahead' : 'behind';
              const cls =
                vehicle.intervalFromPlayer > 0 ? 'text-interval-ahead' : 'text-interval-behind';
              return <span className={cls}>{formatGap(secs)}</span>;
            })();

            const isLongName = vehicle.driverName.length > LONG_NAME_THRESHOLD;

            return (
              <tr
                key={vehicle.id}
                data-testid={vehicle.isPlayer ? 'player-highlight' : undefined}
                className={rowClass}
              >
                <td>
                  <PositionBadge position={vehicle.position} />
                </td>
                <td>
                  <span
                    className="driver-name"
                    title={isLongName ? vehicle.driverName : undefined}
                  >
                    {vehicle.driverName}
                  </span>
                </td>
                <td style={{ color: 'rgba(255,255,255,0.7)' }}>{vehicle.carNumber}</td>
                {classColors.length > 1 && (
                  <td>
                    <span
                      className="class-chip"
                      style={{ background: `${vehicle.color}22`, color: vehicle.color }}
                    >
                      <span
                        className="class-dot"
                        style={{ backgroundColor: vehicle.color }}
                      />
                      {vehicle.color}
                    </span>
                  </td>
                )}
                <td>
                  {vehicle.gapToAhead === null ? (
                    <span className="text-leader">LEADER</span>
                  ) : (
                    formatGap(vehicle.gapToAhead)
                  )}
                </td>
                <td>
                  <TimeDisplay timeMs={vehicle.lastLaptime} />
                </td>
                <td>
                  <TimeDisplay timeMs={vehicle.bestLaptime} />
                </td>
                <td>{intervalDisplay}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </GlassPanel>
  );
}
