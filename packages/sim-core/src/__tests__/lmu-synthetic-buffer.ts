import { LMU, LMU_OBJECT_OUT_SIZE } from "../lmu-offsets";

function wStr(buf: Buffer, off: number, str: string, max: number) {
  const enc = Buffer.from(str, "utf8");
  const l = Math.min(enc.length, max - 1);
  enc.copy(buf, off, 0, l);
  buf[off + l] = 0;
}

// Offsets inside LMUVehicleTelemetry for struct fields not in generated file
const VT_LOCAL_VEL = 184;
const VT_WHEELS_OFF = 848;
const WHEEL_SLOT = 260;

export interface ExpectedValues {
  trackName: string; session: number; gamePhase: number;
  numVehicles: number; playerName: string;
  playerSpeed: number; playerGear: number; playerRpm: number; playerFuel: number;
  vehicles: Array<{ id: number; name: string; place: number }>;
  wheelTemp0: number;
}

export function buildSyntheticLMUBuffer(): { buffer: Buffer; expected: ExpectedValues } {
  const buf = Buffer.alloc(LMU_OBJECT_OUT_SIZE, 0);

  // ─── SCORING INFO (all offsets are absolute) ───
  const SI = LMU.SCORING.SCORING_INFO as any;
  wStr(buf, SI.MTRACKNAME.OFFSET, "Spa", 64);
  buf.writeInt32LE(10, SI.MSESSION);
  buf.writeDoubleLE(1234.5, SI.MCURRENTET);
  buf.writeInt32LE(25, SI.MMAXLAPS);
  buf.writeDoubleLE(7004, SI.MLAPDIST);
  buf.writeInt32LE(3, SI.MNUMVEHICLES);
  buf[SI.MGAMEPHASE] = 5;
  buf[SI.MYELLOWFLAGSTATE] = 0;
  wStr(buf, SI.MPLAYERNAME.OFFSET, "TestDriver", 32);
  buf.writeDoubleLE(25, SI.MAMBIENTTEMP);
  buf.writeDoubleLE(38, SI.MTRACKTEMP);
  buf.writeDoubleLE(0, SI.MRAINING);
  buf.writeFloatLE(3600, SI.MSESSIONTIMEREMAINING);

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
    buf.writeInt32LE(i, off + VS.ID);
    wStr(buf, off + VS.DRIVER_NAME, cars[i].name, 32);
    buf.writeInt16LE(cars[i].laps, off + VS.TOTAL_LAPS);
    buf[off + VS.PLACE] = cars[i].place;
    wStr(buf, off + VS.VEHICLE_CLASS, cars[i].cls, 32);
    buf[off + VS.IS_PLAYER] = i === 0 ? 1 : 0;
    if (i > 0) buf.writeDoubleLE(i * 3, off + VS.TIME_BEHIND_LEADER);
  }

  // ─── TELEMETRY ───
  const T = LMU.TELEMETRY as any;
  buf[T.ACTIVE_VEHICLES] = 3;
  buf[T.PLAYER_VEHICLE_IDX] = 0;
  buf[T.PLAYER_HAS_VEHICLE] = 1;

  // ─── PLAYER TELEMETRY ───
  const VT = LMU.VEHICLE_TELEMETRY as any;
  const po = T.TELEM_INFO.OFFSET + 0 * T.TELEM_INFO.STRIDE;

  buf.writeInt32LE(0, po + VT.ID);
  buf.writeDoubleLE(0.016, po + VT.DELTA_TIME);
  buf.writeDoubleLE(1234.5, po + VT.ELAPSED_TIME);
  buf.writeInt32LE(5, po + VT.LAP_NUMBER);
  wStr(buf, po + VT.VEHICLE_NAME, "Hypercar", 64);
  wStr(buf, po + VT.TRACK_NAME, "Spa", 64);
  buf.writeDoubleLE(15, po + VT_LOCAL_VEL);
  buf.writeDoubleLE(0, po + VT_LOCAL_VEL + 8);
  buf.writeDoubleLE(0, po + VT_LOCAL_VEL + 16);
  buf.writeInt32LE(4, po + VT.GEAR);
  buf.writeDoubleLE(7200, po + VT.ENGINE_RPM);
  buf.writeDoubleLE(82, po + VT.ENGINE_WATER_TEMP);
  buf.writeDoubleLE(95, po + VT.ENGINE_OIL_TEMP);
  buf.writeDoubleLE(0.85, po + VT.FILTERED_THROTTLE);
  buf.writeDoubleLE(0, po + VT.FILTERED_BRAKE);
  buf.writeDoubleLE(45.2, po + VT.FUEL);
  buf.writeDoubleLE(-0.5, po + VT.DELTA_BEST);

  // ─── WHEEL 0 ───
  const WH = LMU.WHEEL as any;
  buf.writeDoubleLE(100, po + VT_WHEELS_OFF + 0 * WHEEL_SLOT + WH.BRAKE_TEMP);
  buf.writeDoubleLE(24, po + VT_WHEELS_OFF + 0 * WHEEL_SLOT + WH.PRESSURE);
  buf.writeDoubleLE(0.3, po + VT_WHEELS_OFF + 0 * WHEEL_SLOT + WH.WEAR);

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

export function extractVehicleAt(buf: Buffer, idx: number): { name: string; place: number } {
  const off = LMU.SCORING.VEH_SCORING_INFO.OFFSET + idx * LMU.SCORING.VEH_SCORING_INFO.STRIDE;
  const VS = LMU.VEHICLE_SCORING as any;
  return {
    name: buf.toString("utf8", off + VS.DRIVER_NAME, off + VS.DRIVER_NAME + 32).replace(/\0/g, "").trim(),
    place: buf[off + VS.PLACE],
  };
}
