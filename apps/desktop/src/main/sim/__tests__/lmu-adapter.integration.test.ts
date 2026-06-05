import { describe, expect, it } from 'vitest';
import { parseLMUObjectOut } from '@vantare/sim-core/lmu-parser';
import { SimNormalizer } from '@vantare/sim-core';
import { buildSyntheticLMUBuffer } from '../../../../../../packages/sim-core/src/__tests__/lmu-synthetic-buffer';
import { LMUAdapterV2 } from '../adapters/lmu-adapter-v2';

describe('LMU adapter integration', () => {
  it('LMUAdapterV2 exposes correct metadata', () => {
    const adapter = new LMUAdapterV2();
    expect(adapter.name).toBe('lmu');
    expect(adapter.displayName).toBe('Le Mans Ultimate');
    expect(adapter.isAvailable()).toBe(true);
  });

  it('parser output normalizes to Telemetry for synthetic buffer', () => {
    const { buffer } = buildSyntheticLMUBuffer();
    const parsed = parseLMUObjectOut(buffer);
    expect(parsed).not.toBeNull();
    expect(parsed!.vehicles.length).toBeGreaterThan(0);

    const pt = parsed!.playerTelemetry;
    expect(pt).not.toBeNull();

    const raw: Record<string, unknown> = {
      speed: pt!['speed'],
      rpm: pt!['engineRpm'],
      gear: pt!['gear'],
      throttle: pt!['throttle'],
      brake: pt!['brake'],
      fuel: pt!['fuel'],
      fuelMax: pt!['fuelCapacity'],
      lap: {
        current: parsed!.vehicles[0]?.['totalLaps'] ?? 0,
        lastTime: 0,
        bestTime: 0,
        sector: 0,
        sectorTimes: [],
        delta: 0,
      },
      tyres: {
        fl: { temp: 0, pressure: 0, wear: 0 },
        fr: { temp: 0, pressure: 0, wear: 0 },
        rl: { temp: 0, pressure: 0, wear: 0 },
        rr: { temp: 0, pressure: 0, wear: 0 },
      },
    };

    const telemetry = new SimNormalizer().normalize(raw, 'lmu');
    expect(telemetry.sim).toBe('lmu');
    expect(telemetry.player.rpm).toBeGreaterThan(0);
    expect(telemetry.player.speed).toBeGreaterThan(0);
  });
});
