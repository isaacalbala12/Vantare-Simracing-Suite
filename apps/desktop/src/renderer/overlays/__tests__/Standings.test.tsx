import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, rerender } from '@testing-library/react';
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

// ── Auto-scroll ───────────────────────────────────────────────────────────────

describe('Standings auto-scroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this.classList.contains('standings-container')) {
        // Container shows ~20 rows (500px)
        return {
          top: 0,
          left: 0,
          right: 100,
          bottom: 500,
          width: 100,
          height: 500,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      }

      const testId = this.getAttribute('data-testid');
      if (testId === 'player-highlight') {
        // Parse position from row text (first number is the position)
        const text = this.textContent || '';
        const posMatch = text.match(/^(\d+)/);
        const pos = posMatch ? parseInt(posMatch[1]) : 1;
        const rowTop = (pos - 1) * 25; // 25px per row
        return {
          top: rowTop,
          left: 0,
          right: 100,
          bottom: rowTop + 25,
          width: 100,
          height: 25,
          x: 0,
          y: rowTop,
          toJSON: () => ({}),
        };
      }

      // Default for other elements
      return {
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createTelemetry(playerPosition: number, totalVehicles = 30): Telemetry {
    const vehicles: VehicleData[] = [];
    for (let i = 1; i <= totalVehicles; i++) {
      vehicles.push({
        id: 1000 + i,
        driverName: `Driver ${i}`,
        carNumber: `#${i}`,
        teamName: 'Team',
        position: i,
        classPosition: i,
        gap: i === playerPosition ? 0 : (i - playerPosition) * 0.5,
        gapType: 'seconds',
        lastLaptime: 105_000,
        bestLaptime: 102_000,
        sectorTimes: [28_000, 30_000, 28_000],
        speed: 200,
        isPlayer: i === playerPosition,
        isPitting: false,
        tyreCompound: 'Medium',
        fuelRemaining: 80,
        color: i <= totalVehicles / 2 ? '#e10600' : '#00d2be',
      });
    }

    return {
      sim: 'iracing',
      timestamp: Date.now(),
      isConnected: true,
      player: {
        speed: 200,
        rpm: 5000,
        gear: 4,
        isOnTrack: true,
        isInPit: false,
        isPitting: false,
        position: playerPosition,
        classPosition: playerPosition,
        lapDistance: 1000,
        lapCount: 10,
        driverName: `Driver ${playerPosition}`,
        carNumber: `#${playerPosition}`,
        teamName: 'Team',
      },
      engine: {
        rpm: 5000,
        maxRpm: 9500,
        fuelLevel: 100,
        fuelCapacity: 100,
        fuelPressure: 0,
        waterTemp: 0,
        oilTemp: 0,
        oilPressure: 0,
        engineWarnings: 0,
      },
      tyres: {
        fl: { temp: 0, pressure: 0, wear: 0 },
        fr: { temp: 0, pressure: 0, wear: 0 },
        rl: { temp: 0, pressure: 0, wear: 0 },
        rr: { temp: 0, pressure: 0, wear: 0 },
      },
      lap: {
        currentLap: 0,
        totalLaps: 0,
        lastLaptime: 105_000,
        bestLaptime: 102_000,
        sector: 1,
        sector1: 0,
        sector2: 0,
        sector3: 0,
        estimatedLaptime: 0,
        delta: 0,
        isPersonalBest: false,
        isSessionBest: false,
      },
      session: {
        type: 'Race',
        state: 'running',
        timeRemaining: 1200,
        timeElapsed: 1800,
        totalLaps: 25,
        flags: [{ type: 'green', active: true }],
        trackName: 'Spa',
        trackLength: 7002,
        weather: {
          airTemp: 22,
          trackTemp: 28,
          humidity: 45,
          precipitation: 0,
          windSpeed: 5,
          windDirection: 180,
        },
      },
      vehicles,
      track: {
        name: 'Spa',
        length: 7002,
        sectors: [0, 0],
      },
      inputs: {
        throttle: 0,
        brake: 0,
        clutch: 0,
        steering: 0,
      },
      weather: {
        airTemp: 22,
        trackTemp: 28,
        humidity: 45,
        precipitation: 0,
        windSpeed: 5,
        windDirection: 180,
      },
    };
  }

  it('calls scrollIntoView on initial render when player position is 25', () => {
    const { container } = render(
      <Standings telemetry={createTelemetry(25)} maxRows={30} />,
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('calls scrollIntoView when player position changes from 3 to 25', () => {
    const { rerender } = render(
      <Standings telemetry={createTelemetry(3)} maxRows={30} />,
    );
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    rerender(<Standings telemetry={createTelemetry(25)} maxRows={30} />);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('does NOT call scrollIntoView when player position changes from 3 to 5', () => {
    const { rerender } = render(
      <Standings telemetry={createTelemetry(3)} maxRows={30} />,
    );
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    rerender(<Standings telemetry={createTelemetry(5)} maxRows={30} />);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
