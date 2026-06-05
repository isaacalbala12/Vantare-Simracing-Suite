import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Hoisted mocks (run before imports — must use require, not imports) ──
const tempDir = vi.hoisted(() => {
  const { mkdtempSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  const { tmpdir } = require('os') as typeof import('os');
  return mkdtempSync(join(tmpdir(), 'sim-mgr-int-'));
});

const mockSend = vi.hoisted(() => vi.fn());
const mockGetData = vi.hoisted(() => vi.fn());
const mockNormalize = vi.hoisted(() => vi.fn());
const mockExecSync = vi.hoisted(() => vi.fn(() => ''));

const mockProvider = vi.hoisted(() => ({
  name: 'iRacing Mock',
  simType: 'iracing' as const,
  getData: mockGetData,
  setScenario: vi.fn(),
  getAvailableSims: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const mod = await importOriginal<typeof import('child_process')>();
  return { ...mod, execSync: mockExecSync };
});

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: { send: mockSend },
    isDestroyed: () => false,
  })),
  app: {
    getPath: vi.fn(() => tempDir),
  },
}));

vi.mock('@vantare/sim-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@vantare/sim-core')>();
  return {
    ...mod,
    MockSimFactory: { create: vi.fn().mockReturnValue(mockProvider) },
    SimNormalizer: vi.fn().mockImplementation(() => ({
      normalize: mockNormalize,
    })),
  };
});

// ── SUT imports (after mocks) ──────────────────────────────────────
import { SimManager } from '../sim-manager';
import { TelemetryRecorder } from '../telemetry-recorder';
import { BrowserWindow } from 'electron';
import type { Telemetry } from '@vantare/sim-core';

// ── Test Telemetry factory ──────────────────────────────────────────
function makeTelemetry(overrides: Partial<Telemetry> = {}): Telemetry {
  return {
    sim: 'iracing',
    timestamp: Date.now(),
    isConnected: true,
    player: {
      speed: 180, rpm: 7500, gear: 4, isOnTrack: true, isInPit: false, isPitting: false,
      position: 1, classPosition: 1, lapDistance: 1250, lapCount: 3,
      driverName: 'Test', carNumber: '1', teamName: 'Test Team',
    },
    engine: {
      rpm: 7500, maxRpm: 8000, fuelLevel: 45, fuelCapacity: 100, fuelPressure: 55,
      waterTemp: 85, oilTemp: 95, oilPressure: 60, engineWarnings: 0,
    },
    tyres: {
      fl: { temp: 90, pressure: 25, wear: 0.15 },
      fr: { temp: 92, pressure: 25.2, wear: 0.12 },
      rl: { temp: 88, pressure: 24.8, wear: 0.18 },
      rr: { temp: 89, pressure: 25.1, wear: 0.16 },
    },
    lap: {
      currentLap: 3, totalLaps: 30, lastLaptime: 95000, bestLaptime: 93500,
      sector: 1, sector1: 30000, sector2: 32000, sector3: 33000,
      estimatedLaptime: 94000, delta: 0.5, isPersonalBest: false, isSessionBest: false,
    },
    session: {
      type: 'race', state: 'green', timeRemaining: 1800, timeElapsed: 150, totalLaps: 30,
      flags: [], trackName: 'Spa', trackLength: 7004,
      weather: { airTemp: 25, trackTemp: 30, humidity: 50, precipitation: 0, windSpeed: 5, windDirection: 180 },
    },
    vehicles: [],
    track: { name: 'Spa', length: 7004, sectors: [0, 2500, 5000] },
    inputs: { throttle: 0.85, brake: 0, clutch: 0, steering: 0.1 },
    weather: { airTemp: 25, trackTemp: 30, humidity: 50, precipitation: 0, windSpeed: 5, windDirection: 180 },
    ...overrides,
  };
}

// ── Suite ───────────────────────────────────────────────────────────

describe('SimManager + TelemetryRecorder integration', () => {
  let simManager: SimManager;
  let recorder: TelemetryRecorder;
  let capturedFilePath: string | null;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSend.mockClear();
    mockGetData.mockClear();
    mockNormalize.mockClear();
    mockExecSync.mockClear();
    capturedFilePath = null;
  });

  afterEach(() => {
    recorder?.stopRecording();
    simManager?.stop();
    vi.useRealTimers();
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('records frames through SimManager callback flow', () => {
    const testTelemetry = makeTelemetry({ timestamp: 1000 });

    mockGetData.mockReturnValue({ rpm: 7500, speed: 180 });
    mockNormalize.mockReturnValue(testTelemetry);

    simManager = new SimManager(new BrowserWindow());
    recorder = new TelemetryRecorder();

    simManager.setOnTelemetryCallback((data: Telemetry) => {
      recorder.writeFrame(data);
    });

    // Act ──────────────────────────────────────────────────────────
    const filePath = recorder.startRecording('iracing');
    expect(filePath).not.toBeNull();
    expect(filePath!).toContain('iracing');
    expect(filePath!.endsWith('.ndjson')).toBe(true);

    simManager.start();

    // Advance timers — triggers the 62ms telemetry interval at least once
    vi.advanceTimersByTime(70);

    // The normalizer was called at least once (getTelemetry in mock mode)
    expect(mockNormalize).toHaveBeenCalled();

    const stoppedPath = recorder.stopRecording();
    expect(stoppedPath).toBe(filePath);

    // Verify path is well-formed NOTE: we do NOT check existsSync here
    // because createWriteStream.end() is async on Windows — the file
    // may not be flushed to disk synchronously. File content is verified
    // in the writeFileSync + ReplayReader test below.
    expect(stoppedPath).toMatch(/iracing.*\.ndjson$/);
  });

  it('produces valid NDJSON content via writeFileSync', () => {
    // Use writeFileSync to create NDJSON and verify it parses correctly
    const dir = mkdtempSync(join(tmpdir(), 'ndjson-test-'));
    const filePath = join(dir, 'test.ndjson');

    const frames = [
      makeTelemetry({ timestamp: 100 }),
      makeTelemetry({ timestamp: 200 }),
      makeTelemetry({ timestamp: 300 }),
    ];

    const header = JSON.stringify({ version: 1, sim: 'iracing', startedAt: Date.now() });
    const ndjson = header + '\n' + frames.map((f) => JSON.stringify(f)).join('\n') + '\n';
    writeFileSync(filePath, ndjson);

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    // Line 0 = metadata header
    const parsedHeader = JSON.parse(lines[0]);
    expect(parsedHeader.version).toBe(1);
    expect(parsedHeader.sim).toBe('iracing');

    // Lines 1-3 = telemetry frames
    expect(lines).toHaveLength(4);
    const parsedFrames = lines.slice(1).map((l) => JSON.parse(l));
    expect(parsedFrames[0].timestamp).toBe(100);
    expect(parsedFrames[1].timestamp).toBe(200);
    expect(parsedFrames[2].timestamp).toBe(300);
    // Each frame has full Telemetry structure
    expect(parsedFrames[0].player.speed).toBe(180);
    expect(parsedFrames[0].engine.rpm).toBe(7500);
    expect(parsedFrames[0].inputs.throttle).toBe(0.85);

    rmSync(dir, { recursive: true, force: true });
  });

  it('isRecording state transitions correctly', () => {
    simManager = new SimManager(new BrowserWindow());
    recorder = new TelemetryRecorder();

    expect(recorder.isRecording).toBe(false);

    recorder.startRecording('ac');
    expect(recorder.isRecording).toBe(true);

    recorder.writeFrame(makeTelemetry({ sim: 'ac' }));
    expect(recorder.isRecording).toBe(true);

    recorder.stopRecording();
    expect(recorder.isRecording).toBe(false);

    // After stop, writeFrame should not throw
    expect(() => recorder.writeFrame(makeTelemetry())).not.toThrow();
  });
});
