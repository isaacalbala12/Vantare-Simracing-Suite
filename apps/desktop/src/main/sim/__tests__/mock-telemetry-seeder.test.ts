import { describe, it, expect } from 'vitest';
import { SeedData } from '../mock-telemetry-seeder';

describe('mock-telemetry-seeder', () => {
  it('emptyState returns Telemetry with no vehicles and no active player', () => {
    const data = SeedData.emptyState();

    expect(data.vehicles.length).toBe(0);
    expect(data.player.position).toBe(1);
    expect(data.isConnected).toBe(true);
    expect(data.sim).toBe('iracing');
  });

  it('midRaceState returns 20 vehicles with player around mid-field and at least 2 classes', () => {
    const data = SeedData.midRaceState();
    const player = data.vehicles.find((v) => v.isPlayer);

    expect(data.vehicles.length).toBe(20);
    expect(player).toBeDefined();
    expect(player?.position).toBeGreaterThanOrEqual(8);
    expect(player?.position).toBeLessThanOrEqual(12);

    const classes = Array.from(new Set(data.vehicles.map((v) => v.color)));
    expect(classes.length).toBeGreaterThanOrEqual(2);
  });

  it('endRaceState returns spread gaps with 20 vehicles and player at position 10', () => {
    const data = SeedData.endRaceState();
    const player = data.vehicles.find((v) => v.isPlayer);

    expect(data.vehicles.length).toBe(20);
    expect(player?.position).toBe(10);

    const gaps = data.vehicles
      .filter((v) => !v.isPlayer)
      .map((v) => v.gap)
      .filter((gap) => Number.isFinite(gap));

    expect(gaps.length).toBeGreaterThan(0);
  });

  it('playerAtFront sets player at position 1 with gap to P2 around 2.5s', () => {
    const data = SeedData.playerAtFront();
    const player = data.vehicles.find((v) => v.isPlayer);

    expect(player?.position).toBe(1);

    const p2 = data.vehicles.find((v) => v.position === 2);
    expect(p2).toBeDefined();
    expect(p2!.gap).toBeGreaterThanOrEqual(2);
    expect(p2!.gap).toBeLessThanOrEqual(3.5);
  });

  it('playerAtBack sets player at last position with gap from P19 around 5s', () => {
    const data = SeedData.playerAtBack();
    const player = data.vehicles.find((v) => v.isPlayer);

    expect(player?.position).toBe(20);

    const p19 = data.vehicles.find((v) => v.position === 19);
    expect(p19).toBeDefined();
    expect(p19!.gap).toBeGreaterThanOrEqual(4);
    expect(p19!.gap).toBeLessThanOrEqual(7);
  });
});
