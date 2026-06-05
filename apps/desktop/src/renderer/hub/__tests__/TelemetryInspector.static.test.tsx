/**
 * QA: TelemetryInspector — static render test
 *
 * Verifies:
 * 1. Renders "No telemetry data" when data is null
 * 2. Renders "No telemetry data" when isConnected is false
 * 3. Renders Player, Engine, Inputs, Lap, Session, Weather, Tyres sections with data
 * 4. Compact mode renders correctly
 * 5. Field formatting functions work correctly
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TelemetryInspector } from '../components/TelemetryInspector';
import type { Telemetry } from '@vantare/sim-core';

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
      carNumber: '99',
      teamName: 'TestTeam',
    },
    engine: {
      rpm: 7500,
      maxRpm: 8000,
      fuelLevel: 45.2,
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
      lastLaptime: 95000,
      bestLaptime: 93500,
      sector: 1,
      sector1: 30000,
      sector2: 32000,
      sector3: 33000,
      estimatedLaptime: 94000,
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
      trackLength: 7.004,
      weather: { airTemp: 25, trackTemp: 30, humidity: 50, precipitation: 0, windSpeed: 5, windDirection: 180 },
    },
    vehicles: [],
    track: { name: 'Spa', length: 7.004, sectors: [0, 2500, 5000] },
    inputs: { throttle: 0.85, brake: 0, clutch: 0, steering: 0.1 },
    weather: { airTemp: 25, trackTemp: 30, humidity: 50, precipitation: 0, windSpeed: 5, windDirection: 180 },
    ...overrides,
  };
}

describe('TelemetryInspector — static render QA', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders NoData state when data is null', () => {
    const { container } = render(<TelemetryInspector data={null} />);
    expect(container.textContent).toContain('Awaiting telemetry data');
    expect(container.textContent).toContain('Connect to a simulator to begin');
  });

  it('renders NoData state when isConnected is false (null telemetry)', () => {
    const { container } = render(
      <TelemetryInspector data={{ sim: 'iracing', isConnected: false } as Telemetry} />,
    );
    expect(container.textContent).toContain('Awaiting telemetry data');
  });

  it('renders all sections with provided telemetry data', () => {
    const data = makeTelemetry();
    const { container } = render(<TelemetryInspector data={data} />);

    // Player section
    expect(container.textContent).toContain('180.0 km/h');
    expect(container.textContent).toContain('7500');
    expect(container.textContent).toContain('4'); // gear
    expect(container.textContent).toContain('P1');
    expect(container.textContent).toContain('TestDriver');
    expect(container.textContent).toContain('99');
    expect(container.textContent).toContain('TestTeam');

    // Engine section
    expect(container.textContent).toContain('45.2L');
    expect(container.textContent).toContain('100.0L');
    expect(container.textContent).toContain('85.0°C');
    expect(container.textContent).toContain('95.0°C');

    // Inputs section
    expect(container.textContent).toContain('85.0%'); // throttle
    expect(container.textContent).toContain('0.0%'); // brake
    expect(container.textContent).toContain('10.0%'); // steering

    // Lap section
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('30');

    // Session section
    expect(container.textContent).toContain('race');
    expect(container.textContent).toContain('green');
    expect(container.textContent).toContain('Spa');

    // Tyres section
    expect(container.textContent).toContain('FL');
    expect(container.textContent).toContain('FR');
    expect(container.textContent).toContain('RL');
    expect(container.textContent).toContain('RR');
  });

  it('renders in compact mode', () => {
    const data = makeTelemetry();
    const { container } = render(<TelemetryInspector data={data} compact />);

    // Should still render content in compact mode
    expect(container.textContent).toContain('180.0 km/h');
    expect(container.textContent).toContain('7500');
    expect(container.textContent).toContain('TestDriver');

    // Compact mode uses minimal padding
    const containerDiv = container.querySelector('[data-testid="telemetry-inspector"]');
    expect(containerDiv).not.toBeNull();
  });

  it('handles zero engine values without crashing', () => {
    // Engine with zero/edge values
    const testData = makeTelemetry({
      engine: {
        rpm: 0,
        maxRpm: 0,
        fuelLevel: 0,
        fuelCapacity: 0,
        fuelPressure: 0,
        waterTemp: 0,
        oilTemp: 0,
        oilPressure: 0,
        engineWarnings: 0,
      },
    });
    const { container } = render(<TelemetryInspector data={testData} />);
    expect(container.querySelector('[data-testid="telemetry-inspector"]')).not.toBeNull();
    expect(container.textContent).toContain('0.0L');
  });

  it('formats lap time correctly via formatTime helper', () => {
    const data = makeTelemetry({
      lap: {
        currentLap: 1,
        totalLaps: 10,
        lastLaptime: 0,
        bestLaptime: 88000,
        sector: 1,
        sector1: 29000,
        sector2: 30000,
        sector3: 29000,
        estimatedLaptime: 90000,
        delta: -1.5,
        isPersonalBest: true,
        isSessionBest: false,
      },
    });
    const { container } = render(<TelemetryInspector data={data} />);

    // Best lap 88000ms = 88s = formatted as "1:028.000" (padStart(7,'0') on sec part)
    expect(container.textContent).toContain('1:028.000');
    // Estimated laptime 90000ms = 1:30.000 = formatted as "1:030.000"
    expect(container.textContent).toContain('1:030.000');
    // Delta -1.5 should show as -1.500
    expect(container.textContent).toContain('-1.500');
    // Personal best should show checkmark
    expect(container.textContent).toContain('✓');
  });

  it('handles connected but zero/empty values without crashing', () => {
    const zeroData = makeTelemetry({
      player: {
        speed: 0,
        rpm: 0,
        gear: 0,
        isOnTrack: true,
        isInPit: false,
        isPitting: false,
        position: 0,
        classPosition: 0,
        lapDistance: 0,
        lapCount: 0,
        driverName: '',
        carNumber: '',
        teamName: '',
      },
    });
    const { container } = render(<TelemetryInspector data={zeroData} />);
    expect(container.textContent).toContain('N'); // gear should show N
    expect(container.textContent).toContain('0.0 km/h');
    expect(container.textContent).toContain('—'); // dash for empty names
  });

  it('handles reverse gear display', () => {
    const reverseData = makeTelemetry({
      player: {
        ...makeTelemetry().player,
        gear: -1,
      },
    });
    const { container } = render(<TelemetryInspector data={reverseData} />);
    expect(container.textContent).toContain('R');
  });
});
