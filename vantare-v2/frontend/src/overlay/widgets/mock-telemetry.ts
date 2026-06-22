import type { TelemetryPayload, TelemetryRefState, VehicleScoring } from "../../lib/telemetry-ref";

export function getMockTelemetry(): TelemetryRefState {
  return {
    seq: 1,
    connected: true,
    playerHasVehicle: true,
    sessionType: 10,
    sessionName: "PRACTICE1",
    sessionEpoch: 1,
    sessionKey: "mock|Circuit de Barcelona|race",
    sessionState: "session",
    timeRemaining: 5328,
    speed: 245,
    gear: 4,
    rpm: 8750,
    fuel: 68,
    deltaBest: -0.150,
    trackName: "Circuit de Barcelona",
    throttle: 78,
    brake: 12,
    clutch: 0,
    vehicles: [
      { id: 0, driverName: "ALPINE", driverNumber: "36", place: 1, isPlayer: false, inPits: false, timeBehindLeader: 0, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#0055A4", tireCompound: "M", fastestLap: false, bestLapTime: 89.823, lastLapTime: 90.412, timeGapToPlayer: 4.55 },
      { id: 1, driverName: "PORSCHE PENSKE", driverNumber: "5", place: 2, isPlayer: false, inPits: false, timeBehindLeader: 1.43, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFFFFF", tireCompound: "M", fastestLap: false, bestLapTime: 90.101, lastLapTime: 91.004, timeGapToPlayer: 3.12 },
      { id: 2, driverName: "FERRARI AF", driverNumber: "51", place: 3, isPlayer: false, inPits: false, timeBehindLeader: 2.152, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#E32636", tireCompound: "S", fastestLap: true, bestLapTime: 89.455, lastLapTime: 90.332, timeGapToPlayer: 2.40 },
      { id: 3, driverName: "CADILLAC RACING", driverNumber: "2", place: 4, isPlayer: false, inPits: false, timeBehindLeader: 3.88, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#F2A900", tireCompound: "M", fastestLap: false, bestLapTime: 91.234, lastLapTime: 92.001, timeGapToPlayer: 0.67 },
      { id: 4, driverName: "TOYOTA GAZOO", driverNumber: "8", place: 5, isPlayer: true, inPits: false, timeBehindLeader: 4.55, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFFFFF", tireCompound: "M", fastestLap: false, bestLapTime: 90.876, lastLapTime: 91.221, timeGapToPlayer: 0 },
      { id: 5, driverName: "PEUGEOT", driverNumber: "94", place: 6, isPlayer: false, inPits: false, timeBehindLeader: 5.55, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#00A3E0", tireCompound: "S", fastestLap: false, bestLapTime: 92.110, lastLapTime: 93.221, timeGapToPlayer: -1.0 },
      { id: 6, driverName: "AF CORSE", driverNumber: "83", place: 7, isPlayer: false, inPits: false, timeBehindLeader: 6.12, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFD700", tireCompound: "H", fastestLap: false, bestLapTime: 92.445, lastLapTime: 93.018, timeGapToPlayer: -1.57 },
      { id: 7, driverName: "HERTZ TEAM JOTA", driverNumber: "12", place: 8, isPlayer: false, inPits: false, timeBehindLeader: 7.4, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#C9B074", tireCompound: "M", fastestLap: false, bestLapTime: 91.789, lastLapTime: 92.554, timeGapToPlayer: -2.85 },
      { id: 8, driverName: "BMW M TEAM", driverNumber: "20", place: 9, isPlayer: false, inPits: false, timeBehindLeader: 8.9, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#000000", tireCompound: "M", fastestLap: false, bestLapTime: 93.0, lastLapTime: 94.102, timeGapToPlayer: -4.35 },
      { id: 9, driverName: "LAMBORGHINI", driverNumber: "63", place: 10, isPlayer: false, inPits: true, pitting: true, timeBehindLeader: 9.25, totalLaps: 33, vehicleClass: "HYPERCAR", teamBrandColor: "#78B833", tireCompound: "", fastestLap: false, bestLapTime: 93.567, lastLapTime: 95.004, timeGapToPlayer: -4.7 },
      { id: 10, driverName: "ISOTTA FRASCHINI", driverNumber: "11", place: 11, isPlayer: false, inPits: false, timeBehindLeader: 11.1, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FF0000", tireCompound: "H", fastestLap: false, bestLapTime: 94.200, lastLapTime: 95.320, timeGapToPlayer: -6.55 },
      { id: 11, driverName: "PROTON COMP", driverNumber: "99", place: 12, isPlayer: false, inPits: false, timeBehindLeader: 12.45, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFFFFF", tireCompound: "M", fastestLap: false, bestLapTime: 94.880, lastLapTime: 96.102, timeGapToPlayer: -7.9 },
      { id: 12, driverName: "UNITED AUTOSPORTS", driverNumber: "22", place: 13, isPlayer: false, inPits: false, timeBehindLeader: 45.5, totalLaps: 34, vehicleClass: "LMP2", teamBrandColor: "#FFFFFF", tireCompound: "M", fastestLap: false, bestLapTime: 95.123, lastLapTime: 96.441, timeGapToPlayer: -8.5 },
      { id: 13, driverName: "INTER EUROPOL", driverNumber: "34", place: 14, isPlayer: false, inPits: false, timeBehindLeader: 52.0, totalLaps: 34, vehicleClass: "LMP2", teamBrandColor: "#E63946", tireCompound: "M", fastestLap: false, bestLapTime: 96.456, lastLapTime: 97.012, timeGapToPlayer: -12.3 },
      { id: 14, driverName: "LIGIER JSP320", driverNumber: "7", place: 15, isPlayer: false, inPits: false, timeBehindLeader: 62.0, totalLaps: 33, vehicleClass: "LMP3", teamBrandColor: "#f59e0b", tireCompound: "H", fastestLap: false, bestLapTime: 102.5, lastLapTime: 103.212, timeGapToPlayer: -18.7 },
      { id: 15, driverName: "GR RACING", driverNumber: "86", place: 16, isPlayer: false, inPits: false, timeBehindLeader: 75.0, totalLaps: 33, vehicleClass: "LMGT3", teamBrandColor: "#2ecc71", tireCompound: "S", fastestLap: false, bestLapTime: 108.2, lastLapTime: 109.334, timeGapToPlayer: -25.4 },
    ],
  };
}

export function generateAnimatedTelemetry(elapsedMs: number, inPit = false): TelemetryPayload {
  const t = elapsedMs / 1000;
  const vehicles: VehicleScoring[] = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    driverName: `Driver ${i + 1}`,
    driverNumber: `${10 + i}`,
    vehicleClass: i < 3 ? "LMP3" : "GT3",
    place: i + 1,
    timeGapToPlayer: (i - 2) * 1.2 + Math.sin(t + i) * 0.3,
    totalLaps: 3 + Math.floor(t / 90),
    inPits: i === 0 && inPit,
    lapDistance: 1000 + (i + 1) * 500 + Math.sin(t * 0.5 + i * 2) * 200,
    timeIntoLap: 20 + (i + 1) * 5 + Math.sin(t * 0.5 + i * 2) * 3,
    bestLapTime: 85 + i * 5,
    lastLapTime: 86 + i * 5,
    estimatedLapTime: 85 + i * 5 + Math.sin(t + i) * 2,
    fastestLap: i === 1,
    teamBrandColor: i % 2 === 0 ? "#e32636" : "#0055A4",
    tireCompound: "M",
  }));

  return {
    seq: Math.floor(t * 10),
    snapshot: {
      connected: true,
      sessionState: "session",
      player: {
        speed: 180 + Math.sin(t) * 40,
        gear: 4,
        engineRPM: 8750 + Math.sin(t * 2) * 500,
        fuel: 68 - t * 0.01,
        deltaBest: Math.sin(t) * 1.5,
        throttle: 70 + Math.sin(t * 2) * 20,
        brake: Math.max(0, Math.sin(t * 3) * 30),
        clutch: 5 + Math.sin(t * 1.5) * 3,
      },
      session: {
        trackName: "Circuit de Barcelona",
        sessionType: 3,
        sessionName: "RACE",
        timeRemainingInGamePhase: 3600 - (t % 3600),
      },
      vehicles,
    },
  };
}
