import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ReplayReader } from '../replay-reader';
import type { Telemetry } from '../../types';

function makeTelemetry(overrides: Partial<Telemetry> = {}): Telemetry {
  return {
    sim: 'iracing',
    timestamp: Date.now(),
    isConnected: true,
    player: {
      speed: 180,
      rpm: 7500,
      gear: 4,
      isOnTrack: true,
      isInPit: false,
      isPitting: false,
      position: 1,
      classPosition: 1,
      lapDistance: 1250,
      lapCount: 3,
      driverName: 'TestDriver',
      carNumber: '123',
      teamName: 'TestTeam',
    },
    engine: {
      rpm: 7500,
      maxRpm: 9000,
      fuelLevel: 45,
      fuelCapacity: 100,
      fuelPressure: 55,
      waterTemp: 85,
      oilTemp: 95,
      oilPressure: 60,
      engineWarnings: 0,
    },
    tyres: {
      fl: { temp: 90, pressure: 25, wear: 0.15 },
      fr: { temp: 92, pressure: 25.2, wear: 0.12 },
      rl: { temp: 88, pressure: 24.8, wear: 0.18 },
      rr: { temp: 89, pressure: 25.1, wear: 0.16 },
    },
    lap: {
      currentLap: 3,
      totalLaps: 30,
      lastLaptime: 95_000,
      bestLaptime: 93_500,
      sector: 1,
      sector1: 30_000,
      sector2: 32_000,
      sector3: 33_000,
      estimatedLaptime: 94_000,
      delta: 0.5,
      isPersonalBest: false,
      isSessionBest: false,
    },
    session: {
      type: 'race',
      state: 'green',
      timeRemaining: 1800,
      timeElapsed: 150,
      totalLaps: 30,
      flags: [],
      trackName: 'Spa',
      trackLength: 7004,
      weather: { airTemp: 25, trackTemp: 30, humidity: 50, precipitation: 0, windSpeed: 5, windDirection: 180 },
    },
    vehicles: [],
    track: { name: 'Spa', length: 7004, sectors: [0, 2500, 5000] },
    inputs: { throttle: 0.85, brake: 0, clutch: 0, steering: 0.1 },
    weather: { airTemp: 25, trackTemp: 30, humidity: 50, precipitation: 0, windSpeed: 5, windDirection: 180 },
    ...overrides,
  };
}

describe('ReplayReader', () => {
  describe('open', () => {
    it('should round-trip telemetry frames (write → read → deep equal)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
      const filePath = join(dir, 'test.ndjson');

      const frames = [makeTelemetry({ timestamp: 1000 }), makeTelemetry({ timestamp: 2000 }), makeTelemetry({ timestamp: 3000 })];
      const header = JSON.stringify({ version: 1, sim: 'iracing', startedAt: Date.now() });
      const lines = frames.map((f) => JSON.stringify(f));

      writeFileSync(filePath, header + '\n' + lines.join('\n') + '\n');

      const result = await ReplayReader.open(filePath);

      expect(result).toHaveLength(3);
      expect(result[0].timestamp).toBe(1000);
      expect(result[1].timestamp).toBe(2000);
      expect(result[2].timestamp).toBe(3000);
      expect(result).toEqual(frames);

      unlinkSync(filePath);
    });

    it('should handle truncated last line gracefully (no crash, 3 frames)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
      const filePath = join(dir, 'truncated.ndjson');

      const frames = [makeTelemetry({ timestamp: 100 }), makeTelemetry({ timestamp: 200 }), makeTelemetry({ timestamp: 300 })];
      const header = JSON.stringify({ version: 1, sim: 'iracing', startedAt: Date.now() });
      const lines = frames.map((f) => JSON.stringify(f));

      // Write header + 3 complete frames + 1 truncated line
      const content = header + '\n' + lines.join('\n') + '\n' + '{"timestamp":400,';
      writeFileSync(filePath, content);

      const result = await ReplayReader.open(filePath);

      expect(result).toHaveLength(3);
      expect(result[0].timestamp).toBe(100);
      expect(result[1].timestamp).toBe(200);
      expect(result[2].timestamp).toBe(300);

      unlinkSync(filePath);
    });

    it('should return empty array for file with only metadata header', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
      const filePath = join(dir, 'empty.ndjson');

      const header = JSON.stringify({ version: 1, sim: 'iracing', startedAt: Date.now() });
      writeFileSync(filePath, header + '\n');

      const result = await ReplayReader.open(filePath);

      expect(result).toEqual([]);

      unlinkSync(filePath);
    });

    it('should skip empty lines in the file', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
      const filePath = join(dir, 'blank.ndjson');

      const frame = makeTelemetry({ timestamp: 999 });
      const header = JSON.stringify({ version: 1, sim: 'iracing', startedAt: Date.now() });
      const content = header + '\n\n\n' + JSON.stringify(frame) + '\n\n';
      writeFileSync(filePath, content);

      const result = await ReplayReader.open(filePath);

      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(999);

      unlinkSync(filePath);
    });

    it('should return empty array for completely empty file (0 bytes)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
      const filePath = join(dir, 'completely-empty.ndjson');

      writeFileSync(filePath, '');

      const result = await ReplayReader.open(filePath);

      expect(result).toEqual([]);

      unlinkSync(filePath);
    });

    it('should return empty array for file with only blank lines', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
      const filePath = join(dir, 'only-blanks.ndjson');

      writeFileSync(filePath, '\n\n\n\n');

      const result = await ReplayReader.open(filePath);

      expect(result).toEqual([]);

      unlinkSync(filePath);
    });

    it('should skip lines with only whitespace', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
      const filePath = join(dir, 'whitespace.ndjson');

      const header = JSON.stringify({ version: 1, sim: 'iracing', startedAt: Date.now() });
      const content = header + '\n   \n\t\n' + JSON.stringify(makeTelemetry({ timestamp: 777 })) + '\n  ';
      writeFileSync(filePath, content);

      const result = await ReplayReader.open(filePath);

      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(777);

      unlinkSync(filePath);
    });
  });
});
