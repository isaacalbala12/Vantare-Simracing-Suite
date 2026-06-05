import { LMU, LMU_OBJECT_OUT_SIZE } from "../lmu-offsets";

function wStr(buf: Buffer, off: number, str: string, max: number) {
  const enc = Buffer.from(str, "utf8");
  const l = Math.min(enc.length, max - 1);
  enc.copy(buf, off, 0, l);
  buf[off + l] = 0;
}

// Hardcoded offsets inside LMUVehicleTelemetry (not in generated file)
const VT_LOCAL_VEL = 184;
const VT_WHEELS_OFF = 848;
const WHEEL_SLOT = 260; // LMU.WHEEL.SIZE

export interface ExpectedValues {
  trackName: string; session: number; gamePhase: number;
  numVehicles: number; playerName: string;
  playerSpeed: number; playerGear: number; playerRpm: number; playerFuel: number;
  vehicles: Array<{ id: number; name: string; place: number }>;
  wheelTemp0: number;
}

export function buildSyntheticLMUBuffer(): { buffer: Buffer; expected: ExpectedValues } {
  const buf = Buffer.alloc(LMU_OBJECT_OUT_SIZE, 0);

  // ─── SCORING INFO (absolute offsets) ───
  const SI = LMU.SCORING.SCORING_INFO as any;
  wStr(buf, SI.MTRACKNAME.OFFSET, "Spa", 64);
  buf.writeInt32LE(SI.MSESSION, 10);
  buf.writeDoubleLE(SI.MCURRENTET, 1234.5);
  buf.writeInt32LE(SI.MMAXLAPS, 25);
  buf.writeDoubleLE(SI.MLAPDIST, 7004);
  buf.writeInt32LE(SI.MNUMVEHICLES, 3);
  buf[SI.MGAMEPHASE] = 5;
  buf[SI.MYELLOWFLAGSTATE] = 0;
  wStr(buf, SI.MPLAYERNAME.OFFSET, "TestDriver", 32);
  buf.writeDoubleLE(SI.MAMBIENTTEMP, 25);
  buf.writeDoubleLE(SI.MTRACKTEMP, 38);
  buf.writeDoubleLE(SI.MRAINING, 0);
  buf.writeFloatLE(SI.MSESSIONTIMEREMAINING, 3600);

  // ─── VEHICLE SCORING ───
  const VS_OFF = LMU.SCORING.VEH_SCORING_INFO.OFFSET;
  const VS_STR = LMU.SCORING.VEH_SCORING_INFO.STRIDE;
  const VS = LMU.VEHICLE_SCORING as any;

  const cars = [
    { name: "TestDriver", cls: "Hypercar", place: 1, laps: 5 },
    { name: "AI One", cls: "Hypercar", place: 2, laps: 5 },
    { name: "AI Two", cls: "GT3", place: 3, laps: 4 },
  ];
  for (let i = 0; i < 3; i++) {
    const off = VS_OFF + i * VS_STR;
    buf.writeInt32LE(off + VS.ID, i);
    wStr(buf, off + VS.DRIVER_NAME, cars[i].name, 32);
    buf.writeInt16LE(off + VS.TOTAL_LAPS, cars[i].laps);
    buf[off + VS.PLACE] = cars[i].place;
    wStr(buf, off + VS.VEHICLE_CLASS, cars[i].cls, 32);
    buf[off + VS.IS_PLAYER] = i === 0 ? 1 : 0;
  }

  // ─── TELEMETRY ───
  const T = LMU.TELEMETRY as any;
  buf[T.ACTIVE_VEHICLES] = 3;
  buf[T.PLAYER_VEHICLE_IDX] = 0;
  buf[T.PLAYER_HAS_VEHICLE] = 1;

  // ─── PLAYER TELEMETRY ───
  const VT = LMU.VEHICLE_TELEMETRY as any;
  const po = T.TELEM_INFO.OFFSET + 0 * T.TELEM_INFO.STRIDE;

  buf.writeInt32LE(po + VT.ID, 0);
  buf.writeDoubleLE(po + VT.DELTA_TIME, 0.016);
  buf.writeDoubleLE(po + VT.ELAPSED_TIME, 1234.5);
  buf.writeInt32LE(po + VT.LAP_NUMBER, 5);
  wStr(buf, po + VT.VEHICLE_NAME, "Hypercar", 64);
  wStr(buf, po + VT.TRACK_NAME, "Spa", 64);
  buf.writeDoubleLE(po + VT_LOCAL_VEL, 15);
  buf.writeDoubleLE(po + VT_LOCAL_VEL + 8, 0);
  buf.writeDoubleLE(po + VT_LOCAL_VEL + 16, 0);
  buf.writeInt32LE(po + VT.GEAR, 4);
  buf.writeDoubleLE(po + VT.ENGINE_RPM, 7200);
  buf.writeDoubleLE(po + VT.FUEL, 45.2);
  buf.writeDoubleLE(po + VT.DELTA_BEST, -0.5);

  // ─── WHEEL 0 ───
  const WH = LMU.WHEEL as any;
  buf.writeDoubleLE(po + VT_WHEELS_OFF + 0 * WHEEL_SLOT + WH.BRAKE_TEMP, 100);

  return {
    buffer: buf,
    expected: {
      trackName: "Spa", session: 10, gamePhase: 5,
      numVehicles: 3, playerName: "TestDriver",
      playerSpeed: 15, playerGear: 4, playerRpm: 7200, playerFuel: 45.2,
      vehicles: cars.map((c, i) => ({ id: i, name: c.name, place: c.place })),
      wheelTemp0: 100,
    },
  };
}

export function extractScoringInfo(buf: Buffer) {
  const SI = LMU.SCORING.SCORING_INFO as any;
  return {
    trackName: buf.toString("utf8", SI.MTRACKNAME.OFFSET, SI.MTRACKNAME.OFFSET + 64).replace(/\0/g, "").trim(),
    session: buf.readInt32LE(SI.MSESSION),
    currentET: buf.readDoubleLE(SI.MCURRENTET),
    gamePhase: buf[SI.MGAMEPHASE],
    numVehicles: buf.readInt32LE(SI.MNUMVEHICLES),
  };
}

export function extractPlayerTelemetry(buf: Buffer) {
  const T = LMU.TELEMETRY as any;
  const VT = LMU.VEHICLE_TELEMETRY as any;
  const po = T.TELEM_INFO.OFFSET + 0 * T.TELEM_INFO.STRIDE;
  const x = buf.readDoubleLE(po + VT_LOCAL_VEL);
  const y = buf.readDoubleLE(po + VT_LOCAL_VEL + 8);
  const z = buf.readDoubleLE(po + VT_LOCAL_VEL + 16);
  return {
    id: buf.readInt32LE(po + VT.ID),
    speed: Math.sqrt(x*x + y*y + z*z),
    gear: buf.readInt32LE(po + VT.GEAR),
    rpm: buf.readDoubleLE(po + VT.ENGINE_RPM),
    fuel: buf.readDoubleLE(po + VT.FUEL),
  };
}

export function extractWheelTemp(buf: Buffer, wheelIdx: number): number {
  const T = LMU.TELEMETRY as any;
  const WH = LMU.WHEEL as any;
  const po = T.TELEM_INFO.OFFSET + 0 * T.TELEM_INFO.STRIDE;
  return buf.readDoubleLE(po + VT_WHEELS_OFF + wheelIdx * WHEEL_SLOT + WH.BRAKE_TEMP);
}
