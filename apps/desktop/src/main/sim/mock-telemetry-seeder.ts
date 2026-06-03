import type { Telemetry, VehicleData } from '@vantare/sim-core';

const DRIVERS = [
  'John Smith',
  'Carlos Mendez',
  'Liam OConnor',
  'Max Verstappen',
  'Lewis Hamilton',
  'Charles Leclerc',
  'Lando Norris',
  'George Russell',
  'Fernando Alonso',
  'Sergio Perez',
  'Oscar Piastri',
  'Pierre Gasly',
  'Alex Albon',
  'Esteban Ocon',
  'Lance Stroll',
  'Yuki Tsunoda',
  'Valtteri Bottas',
  'Kevin Magnussen',
  'Daniel Ricciardo',
  'Nico Hulkenberg',
];

const CLASSES = [
  { name: 'GT3', color: '#e10600' },
  { name: 'GTE', color: '#00d2be' },
];

function buildBase(partial: Partial<Telemetry> = {}): Telemetry {
  const now = Date.now();
  return {
    sim: 'iracing',
    timestamp: now,
    isConnected: true,
    player: {
      speed: 0,
      rpm: 0,
      gear: 0,
      isOnTrack: false,
      isInPit: false,
      isPitting: false,
      position: 1,
      classPosition: 1,
      lapDistance: 0,
      lapCount: 0,
      driverName: '',
      carNumber: '',
      teamName: '',
    },
    engine: {
      rpm: 0,
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
      lastLaptime: 0,
      bestLaptime: 0,
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
      timeRemaining: 0,
      timeElapsed: 0,
      totalLaps: 0,
      flags: [],
      trackName: '',
      trackLength: 0,
      weather: {
        airTemp: 0,
        trackTemp: 0,
        humidity: 0,
        precipitation: 0,
        windSpeed: 0,
        windDirection: 0,
      },
    },
    vehicles: [],
    track: {
      name: '',
      length: 0,
      sectors: [0, 0],
    },
    inputs: {
      throttle: 0,
      brake: 0,
      clutch: 0,
      steering: 0,
    },
    weather: {
      airTemp: 0,
      trackTemp: 0,
      humidity: 0,
      precipitation: 0,
      windSpeed: 0,
      windDirection: 0,
    },
    ...partial,
  };
}

function makeVehicle(args: {
  position: number;
  isPlayer: boolean;
  gap: number;
  classIndex: number;
  driverIndex: number;
}): VehicleData {
  const { position, isPlayer, gap, classIndex, driverIndex } = args;
  const cls = CLASSES[classIndex % CLASSES.length];
  return {
    id: 1000 + position,
    driverName: DRIVERS[driverIndex % DRIVERS.length],
    carNumber: `#${position}`,
    teamName: 'Team',
    position,
    classPosition: position,
    gap,
    gapType: 'seconds',
    lastLaptime: 105_000 + Math.random() * 10_000,
    bestLaptime: 102_000 + Math.random() * 6_000,
    sectorTimes: [
      28_000 + Math.random() * 5_000,
      30_000 + Math.random() * 5_000,
      28_000 + Math.random() * 5_000,
    ],
    speed: 200 + Math.random() * 100,
    isPlayer,
    isPitting: false,
    tyreCompound: 'Medium',
    fuelRemaining: 80 + Math.random() * 20,
    color: cls.color,
  };
}

export const SeedData = {
  emptyState(): Telemetry {
    return buildBase();
  },

  midRaceState(): Telemetry {
    const vehicles: VehicleData[] = [];
    let cumulative = 0;

    for (let i = 1; i <= 20; i++) {
      const isPlayer = i === 10;
      if (!isPlayer) {
        cumulative += 0.5 + Math.random() * 2.5;
      }
      vehicles.push(
        makeVehicle({
          position: i,
          isPlayer,
          gap: isPlayer ? 0 : cumulative,
          classIndex: i <= 10 ? 0 : 1,
          driverIndex: i - 1,
        }),
      );
    }

    return buildBase({
      vehicles,
      player: {
        speed: 210 + Math.random() * 80,
        rpm: 5000 + Math.random() * 3000,
        gear: 4,
        isOnTrack: true,
        isInPit: false,
        isPitting: false,
        position: 10,
        classPosition: 5,
        lapDistance: 1000 + Math.random() * 5000,
        lapCount: 12,
        driverName: DRIVERS[9],
        carNumber: '#10',
        teamName: 'Team',
      },
      session: {
        type: 'Race',
        state: 'running',
        timeRemaining: 1200,
        timeElapsed: 1800,
        totalLaps: 25,
        flags: [{ type: 'green', active: true }],
        trackName: 'Spa-Francorchamps',
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
    });
  },

  endRaceState(): Telemetry {
    const vehicles: VehicleData[] = [];
    const dnfPositions = new Set([17, 18]);

    for (let i = 1; i <= 20; i++) {
      const isDnf = dnfPositions.has(i);
      const baseGap = i === 10 ? 0 : Math.pow(i - 10, 1.6) * 0.45;
      const gap = i === 10 ? 0 : baseGap;

      vehicles.push(
        makeVehicle({
          position: isDnf ? i : i,
          isPlayer: i === 10,
          gap,
          classIndex: i <= 10 ? 0 : 1,
          driverIndex: i - 1,
        }),
      );
    }

    return buildBase({
      vehicles,
      player: {
        speed: 0,
        rpm: 0,
        gear: 0,
        isOnTrack: false,
        isInPit: true,
        isPitting: false,
        position: 10,
        classPosition: 5,
        lapDistance: 0,
        lapCount: 25,
        driverName: DRIVERS[9],
        carNumber: '#10',
        teamName: 'Team',
      },
      session: {
        type: 'Race',
        state: 'finished',
        timeRemaining: 0,
        timeElapsed: 5400,
        totalLaps: 25,
        flags: [{ type: 'checkered', active: true }],
        trackName: 'Spa-Francorchamps',
        trackLength: 7002,
        weather: {
          airTemp: 24,
          trackTemp: 30,
          humidity: 40,
          precipitation: 0,
          windSpeed: 3,
          windDirection: 200,
        },
      },
    });
  },

  playerAtFront(): Telemetry {
    const vehicles: VehicleData[] = [
      makeVehicle({
        position: 1,
        isPlayer: true,
        gap: 0,
        classIndex: 0,
        driverIndex: 0,
      }),
    ];

    let cumulative = 2.5;
    for (let i = 2; i <= 20; i++) {
      vehicles.push(
        makeVehicle({
          position: i,
          isPlayer: false,
          gap: cumulative,
          classIndex: i <= 10 ? 0 : 1,
          driverIndex: i - 1,
        }),
      );
      cumulative += 0.8 + Math.random() * 3.5;
    }

    return buildBase({
      vehicles,
      player: {
        speed: 225 + Math.random() * 60,
        rpm: 7000 + Math.random() * 2000,
        gear: 5,
        isOnTrack: true,
        isInPit: false,
        isPitting: false,
        position: 1,
        classPosition: 1,
        lapDistance: 3000 + Math.random() * 2000,
        lapCount: 14,
        driverName: DRIVERS[0],
        carNumber: '#1',
        teamName: 'Team',
      },
      session: {
        type: 'Race',
        state: 'running',
        timeRemaining: 900,
        timeElapsed: 2100,
        totalLaps: 25,
        flags: [{ type: 'green', active: true }],
        trackName: 'Monza',
        trackLength: 5793,
        weather: {
          airTemp: 20,
          trackTemp: 26,
          humidity: 50,
          precipitation: 0,
          windSpeed: 4,
          windDirection: 160,
        },
      },
    });
  },

  playerAtBack(): Telemetry {
    const vehicles: VehicleData[] = [];

    for (let i = 1; i <= 19; i++) {
      vehicles.push(
        makeVehicle({
          position: i,
          isPlayer: false,
          gap: i === 19 ? 5 : 0,
          classIndex: i <= 10 ? 0 : 1,
          driverIndex: i - 1,
        }),
      );
    }

    vehicles.push(
      makeVehicle({
        position: 20,
        isPlayer: true,
        gap: 0,
        classIndex: 1,
        driverIndex: 19,
      }),
    );

    return buildBase({
      vehicles,
      player: {
        speed: 195 + Math.random() * 80,
        rpm: 5500 + Math.random() * 3000,
        gear: 3,
        isOnTrack: true,
        isInPit: false,
        isPitting: false,
        position: 20,
        classPosition: 10,
        lapDistance: 500 + Math.random() * 2000,
        lapCount: 13,
        driverName: DRIVERS[19],
        carNumber: '#20',
        teamName: 'Team',
      },
      session: {
        type: 'Race',
        state: 'running',
        timeRemaining: 1100,
        timeElapsed: 1900,
        totalLaps: 25,
        flags: [{ type: 'green', active: true }],
        trackName: 'Silverstone',
        trackLength: 5891,
        weather: {
          airTemp: 18,
          trackTemp: 24,
          humidity: 60,
          precipitation: 10,
          windSpeed: 8,
          windDirection: 210,
        },
      },
    });
  },
};
