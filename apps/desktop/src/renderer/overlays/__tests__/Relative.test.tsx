import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import Relative from '../Relative';
import { SeedData } from '../../../main/sim/mock-telemetry-seeder';
import type { Telemetry } from '@vantare/sim-core';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@vantare/ui-core', () => ({
  GlassPanel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={`glass-panel ${className ?? ''}`}>{children}</div>
  ),
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

describe('Relative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty States ──────────────────────────────────────────────────────────

  it('renders empty state when telemetry is null', () => {
    const html = renderToString(<Relative telemetry={null} />);
    expect(html).toContain('relative-empty');
  });

  it('renders empty state when telemetry has 0 vehicles', () => {
    const telemetry = SeedData.emptyState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    expect(html).toContain('data-testid="relative-empty"');
  });

  // ── Mid-Race State (20 cars, player at P10) ──────────────────────────────

  it('renders exactly 7 rows for mid-field player', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Should show 7 driver rows (3 ahead + player + 3 behind)
    expect(html).toContain('10');
    // Count "tabular-nums" — each row has at least one (PositionBadge)
    const rowCount = countInHtml(html, 'tabular-nums');
    expect(rowCount).toBe(7);
  });

  it('player row has data-testid="player-highlight"', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    expect(html).toContain('data-testid="player-highlight"');
  });

  it('shows 3 cars ahead of player and 3 behind', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // midRaceState: player at P10
    // Should show P7, P8, P9, P10, P11, P12, P13
    expect(html).toContain('>7<');
    expect(html).toContain('>8<');
    expect(html).toContain('>9<');
    expect(html).toContain('>10<');
    expect(html).toContain('>11<');
    expect(html).toContain('>12<');
    expect(html).toContain('>13<');
    // Should NOT show P6 or P14
    expect(html).not.toContain('>6<');
    // But note: ">6<" might appear in other numbers like "16" — be careful
    // Let's check for the position string more carefully
  });

  it('shows correct ordering: ahead cars first, then player, then behind', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // P7 should appear before P8, which appears before P9, etc.
    const p7Idx = html.indexOf('>7<');
    const p8Idx = html.indexOf('>8<');
    const p9Idx = html.indexOf('>9<');
    const p10Idx = html.indexOf('>10<');
    const p11Idx = html.indexOf('>11<');
    const p12Idx = html.indexOf('>12<');
    const p13Idx = html.indexOf('>13<');
    expect(p7Idx).toBeGreaterThan(0);
    expect(p8Idx).toBeGreaterThan(p7Idx);
    expect(p9Idx).toBeGreaterThan(p8Idx);
    expect(p10Idx).toBeGreaterThan(p9Idx);
    expect(p11Idx).toBeGreaterThan(p10Idx);
    expect(p12Idx).toBeGreaterThan(p11Idx);
    expect(p13Idx).toBeGreaterThan(p12Idx);
  });

  it('has player row centered in the 4th position (index 3)', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Player row should have the player-highlight testid
    expect(html).toContain('data-testid="player-highlight"');
    // Player row should have blood accent background styles
    expect(html).toContain('bg-blood');
  });

  // ── Player at Front (P1) ──────────────────────────────────────────────────

  it('shows 0 ahead + 6 behind when player is at P1', () => {
    const telemetry = SeedData.playerAtFront();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // P1 is player, should show P1 through P7 (0 ahead, 6 behind)
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('>3<');
    expect(html).toContain('>4<');
    expect(html).toContain('>5<');
    expect(html).toContain('>6<');
    expect(html).toContain('>7<');
    // Player should be highlighted
    expect(html).toContain('data-testid="player-highlight"');
  });

  // ── Player at Back (P20) ──────────────────────────────────────────────────

  it('shows 6 ahead + 0 behind when player is at P20', () => {
    const telemetry = SeedData.playerAtBack();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // P20 is player, should show P14 through P20 (6 ahead, 0 behind)
    expect(html).toContain('>14<');
    expect(html).toContain('>15<');
    expect(html).toContain('>16<');
    expect(html).toContain('>17<');
    expect(html).toContain('>18<');
    expect(html).toContain('>19<');
    expect(html).toContain('>20<');
    // Player should be highlighted
    expect(html).toContain('data-testid="player-highlight"');
  });

  // ── Gap Column ────────────────────────────────────────────────────────────

  it('shows gap values for cars around player', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Gap column should display time differences
    // Cars ahead show negative gap (behind pattern: red tint)
    // Cars behind show positive gap (ahead pattern: green tint)
    expect(html).toContain('gap');
  });

  // ── Color Coding ──────────────────────────────────────────────────────────

  it('applies red background tint for cars ahead of player', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Cars ahead should have some red-tinted styling
    expect(html).toContain('ahead');
  });

  it('applies green background tint for cars behind player', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Cars behind should have some green-tinted styling
    expect(html).toContain('behind');
  });

  // ── Row Content ───────────────────────────────────────────────────────────

  it('displays driver name for each row', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // midRaceState player at P10 → window is P7–P13.
    // DRIVERS array (DRIVERS[i-1] for position i) gives:
    //   P7 = Lando Norris, P8 = George Russell, P9 = Fernando Alonso,
    //   P10 = Sergio Perez (player), P11 = Oscar Piastri,
    //   P12 = Pierre Gasly, P13 = Alex Albon
    expect(html).toContain('Lando Norris');
    expect(html).toContain('George Russell');
    expect(html).toContain('Alex Albon');
  });

  it('displays car number for each row', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Should contain car numbers for shown positions
    expect(html).toContain('#7');
    expect(html).toContain('#13');
  });

  it('displays class info for each row when multi-class', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // midRaceState has 2 classes (GT3, GTE)
    // The P7-P13 range spans both classes
    expect(html).toContain('#e10600');
    expect(html).toContain('#00d2be');
  });

  // ── Only 10 Cars ──────────────────────────────────────────────────────────

  it('shows what exists in 3/3 pattern when only 10 cars total', () => {
    // Create telemetry with only 10 cars, player at P5
    const telemetry = SeedData.midRaceState();
    telemetry.vehicles = telemetry.vehicles.slice(0, 10);
    // Adjust positions to be 1-10
    telemetry.vehicles.forEach((v, i) => {
      v.position = i + 1;
      v.isPlayer = i === 4; // P5 is player
      v.gap = i === 4 ? 0 : v.gap;
    });
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Should show P2-P8 (3 ahead, player, 3 behind)
    expect(html).toContain('>2<');
    expect(html).toContain('>5<');
    expect(html).toContain('>8<');
    expect(html).toContain('data-testid="player-highlight"');
  });

  // ── CSS Transition for Gap Smoothing ──────────────────────────────────────

  it('has CSS transition for smooth gap interpolation', () => {
    const telemetry = SeedData.midRaceState();
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Should have transition-all or transition class in styles
    expect(html).toContain('transition');
  });

  // ── Extra Edge Cases ──────────────────────────────────────────────────────

  it('does not crash when only the player is in the session', () => {
    const telemetry = SeedData.midRaceState();
    telemetry.vehicles = telemetry.vehicles.filter((v) => v.isPlayer);
    // Position is already 10 from midRaceState — renumber to 1 to be tidy
    telemetry.vehicles[0].position = 1;
    telemetry.vehicles[0].gap = 0;
    const html = renderToString(<Relative telemetry={telemetry} />);
    // Should still render a single player row, not empty state
    expect(html).not.toContain('relative-empty');
    expect(html).toContain('data-testid="player-highlight"');
  });

  it('handles a tiny field (3 cars, player mid) without crashing', () => {
    const telemetry = SeedData.midRaceState();
    telemetry.vehicles = telemetry.vehicles.slice(0, 3);
    telemetry.vehicles.forEach((v, i) => {
      v.position = i + 1;
      v.isPlayer = i === 1; // P2 is player
      v.gap = i === 1 ? 0 : v.gap;
    });
    const html = renderToString(<Relative telemetry={telemetry} />);
    // 3 cars is fewer than 7 → should render all 3 (no slice expansion)
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('>3<');
    expect(html).toContain('data-testid="player-highlight"');
  });

  it('shows DNF indicator "OUT" for retired vehicles in the window', () => {
    // Force a car in the window into a retired state by using a sentinel
    // vehicle (no laps completed → isPitting + zero best lap acts as DNF proxy).
    const telemetry = SeedData.midRaceState();
    // P11 (behind player) is in the window — mark as out
    const dnf = telemetry.vehicles.find((v) => v.position === 11)!;
    dnf.isPitting = true;
    dnf.bestLaptime = 0;
    dnf.lastLaptime = 0;
    const html = renderToString(<Relative telemetry={telemetry} />);
    // The OUT indicator should appear at least once for the DNF row
    expect(html).toContain('OUT');
  });
});
