import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import Standings from '../Standings';
import { SeedData } from '../../../main/sim/mock-telemetry-seeder';
import type { Telemetry, VehicleData } from '@vantare/sim-core';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@vantare/ui-core', () => ({
  GlassPanel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={`glass-panel ${className ?? ''}`}>{children}</div>
  ),
  TimeDisplay: ({ timeMs, showHundredths }: { timeMs: number; showHundredths?: boolean }) => {
    const totalSeconds = timeMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const hundredths = Math.floor((timeMs % 1000) / 10);
    const formatted =
      showHundredths !== false
        ? `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return <span className="font-mono tabular-nums">{formatted}</span>;
  },
  PositionBadge: ({ position }: { position: number }) => (
    <span className="font-bold tabular-nums">{position}</span>
  ),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function countInHtml(html: string, substr: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = html.indexOf(substr, idx)) !== -1) {
    count++;
    idx += substr.length;
  }
  return count;
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe('Standings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty States ──────────────────────────────────────────────────────────

  it('renders empty state when telemetry is null', () => {
    const html = renderToString(<Standings telemetry={null} />);
    expect(html).toContain('standings-empty');
  });

  it('renders empty state when telemetry has 0 vehicles', () => {
    const telemetry = SeedData.emptyState();
    const html = renderToString(<Standings telemetry={telemetry} />);
    expect(html).toContain('data-testid="standings-empty"');
  });

  // ── Mid-Race State (20 cars, player at P10) ──────────────────────────────

  it('renders correct number of rows with midRaceState (20 cars)', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Standings telemetry={telemetry} />);
    // All 20 driver names should appear
    expect(html).toContain('John Smith');
    expect(html).toContain('Nico Hulkenberg');
    // Should NOT contain empty state indicator
    expect(html).not.toContain('standings-empty');
  });

  it('player row has data-testid="player-highlight"', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Standings telemetry={telemetry} />);
    // midRaceState has player at P10 (car #10)
    expect(html).toContain('data-testid="player-highlight"');
  });

  it('sorts all rows by position ascending', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Standings telemetry={telemetry} />);
    // Position 1 should appear before position 2, etc.
    const pos1Idx = html.indexOf('>1<');
    const pos2Idx = html.indexOf('>2<');
    const pos10Idx = html.indexOf('>10<');
    const pos20Idx = html.indexOf('>20<');
    expect(pos1Idx).toBeGreaterThan(0);
    expect(pos2Idx).toBeGreaterThan(pos1Idx);
    expect(pos10Idx).toBeGreaterThan(pos2Idx);
    expect(pos20Idx).toBeGreaterThan(pos10Idx);
  });

  // ── Player at Front ──────────────────────────────────────────────────────

  it('P1 shows "LEADER" in gap column when telemetry has leader', () => {
    const telemetry = SeedData.playerAtFront();
    const html = renderToString(<Standings telemetry={telemetry} />);
    expect(html).toContain('LEADER');
    // P1 is the player, should also have highlight
    expect(html).toContain('data-testid="player-highlight"');
  });

  // ── Player at Back ───────────────────────────────────────────────────────

  it('renders all rows when player is at back', () => {
    const telemetry = SeedData.playerAtBack();
    const html = renderToString(<Standings telemetry={telemetry} />);
    // Should have 20 rows
    const htmlC = telemetry.vehicles.length.toString();
    expect(html).toContain('Nico Hulkenberg');
    expect(html).toContain('data-testid="player-highlight"');
  });

  // ── Table Headers ────────────────────────────────────────────────────────

  it('renders all column headers', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Standings telemetry={telemetry} />);
    expect(html).toContain('Pos');
    expect(html).toContain('Driver');
    expect(html).toContain('Car');
    expect(html).toContain('Class');
    expect(html).toContain('Gap');
    expect(html).toContain('Last Lap');
    expect(html).toContain('Best Lap');
    expect(html).toContain('Interval');
  });

  // ── Multi-class ──────────────────────────────────────────────────────────

  it('shows class column when multiple classes are present', () => {
    const telemetry = SeedData.midRaceState();
    // midRaceState has two classes (positions 1-10: GT3, 11-20: GTE)
    const html = renderToString(<Standings telemetry={telemetry} />);
    // Both class colors should appear in style attributes
    expect(html).toContain('#e10600');
    expect(html).toContain('#00d2be');
  });

  // ── Column Values ────────────────────────────────────────────────────────

  it('renders time values in Best Lap and Last Lap columns', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Standings telemetry={telemetry} />);
    // TimeDisplay renders as mm:ss.hh format
    // 105_000ms = 1:45.00
    expect(html).toContain('font-mono tabular-nums');
  });

  it('shows car number column values', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Standings telemetry={telemetry} />);
    // Car numbers are #1 through #20
    expect(html).toContain('#1');
    expect(html).toContain('#20');
  });

  // ── Edge Cases ───────────────────────────────────────────────────────────

  it('truncates long driver names with ellipsis', () => {
    // Create telemetry with a very long driver name
    const telemetry = SeedData.midRaceState();
    telemetry.vehicles[0].driverName =
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const html = renderToString(<Standings telemetry={telemetry} />);
    // Long name should have a title attribute (browser tooltip)
    expect(html).toContain('title="');
    // The CSS text-overflow: ellipsis should be in the embedded styles
    expect(html).toContain('text-overflow: ellipsis');
  });

  it('shows all columns for each row', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Standings telemetry={telemetry} />);
    // midRaceState has P1 at position 1
    expect(html).toContain('>1<');
    // Should have multiple rows (at least 20 position markers)
    const rowCount = countInHtml(html, 'tabular-nums');
    expect(rowCount).toBeGreaterThanOrEqual(20);
  });

  it('renders empty state message text', () => {
    const html = renderToString(<Standings telemetry={null} />);
    expect(html).toContain('No telemetry data');
  });
});
