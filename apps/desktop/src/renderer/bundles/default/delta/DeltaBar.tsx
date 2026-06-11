import React from 'react';
import { GlassPanel, useTheme } from '@vantare/ui-core';
import { calculateDeltaToBest } from '@vantare/sim-core/calculations/delta';
import type { Telemetry } from '@vantare/sim-core';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DeltaBarProps {
  telemetry: Telemetry | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Visual bar full-width represents this many seconds of delta. */
const MAX_DELTA_SECONDS = 5;
const EM_DASH = '\u2014'; // —

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns the rendered value when there is no meaningful delta to show. */
function NeutralDelta() {
  return (
    <div data-testid="delta-bar" data-direction="neutral" className="delta-bar">
      <GlassPanel className="delta-overlay">
        <div className="delta-track">
          <div className="delta-center-line" />
        </div>
        <span className="delta-value delta-value--neutral" data-testid="delta-value">
          {EM_DASH}
        </span>
      </GlassPanel>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DeltaBar({ telemetry }: DeltaBarProps) {
  // ── Empty state: no telemetry or no lap data ─────────────────────────
  if (!telemetry || !telemetry.lap) {
    return <NeutralDelta />;
  }

  const { lastLaptime, bestLaptime } = telemetry.lap;

  // ── Defensive: both must be positive to compute a meaningful delta ─
  if (lastLaptime === 0 || bestLaptime === 0) {
    return <NeutralDelta />;
  }

  const delta = calculateDeltaToBest(lastLaptime, bestLaptime);

  // ── Defensive: if NaN/Infinity (shouldn't happen, but guard anyway) ─
  if (!Number.isFinite(delta)) {
    return <NeutralDelta />;
  }

  // ── Direction: positive = slower (red), negative = faster (green) ──
  const direction: 'positive' | 'negative' | 'neutral' =
    delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';

  // Exact-zero delta (== best lap): show neutral dash, no bar to fill
  if (direction === 'neutral') {
    return <NeutralDelta />;
  }

  // Sign prefix: positive gets "+", negative already has "-" from toString
  // Delta is in milliseconds (lap times are in ms); convert to seconds for display
  const sign = delta > 0 ? '+' : '';
  const formatted = `${sign}${(delta / 1000).toFixed(3)}s`;

  const { themeId } = useTheme();
  const isF1 = themeId === 'f1';
  // ── Visual bar: width proportional to |delta|, capped at 100% ──────
  const barWidth = Math.min(Math.abs(delta) / MAX_DELTA_SECONDS, 1) * 100;
  // Positive delta fills from the center going right; negative fills going left
  const fillStyle: React.CSSProperties = {
    width: `${barWidth}%`,
    ...(direction === 'positive'
      ? { left: '50%' }
      : { right: '50%' }),
  };

  return (
    <div data-testid="delta-bar" data-direction={direction} className="delta-bar">
      <GlassPanel className={`delta-overlay${isF1 ? ' f1' : ''}`}>
        <div className="delta-track">
          <div
            className={`delta-fill delta-fill--${direction}`}
            style={fillStyle}
            data-testid="delta-fill"
          />
          <div className="delta-center-line" />
        </div>
        <span
          className={`delta-value delta-value--${direction}`}
          data-testid="delta-value"
        >
          {formatted}
        </span>
      </GlassPanel>
    </div>
  );
}
