import { describe, it, expect } from 'vitest';
import { IRacingAdapter } from '../adapters/iracing-adapter';

// ── iRacing SDK constants (mirrors adapter) ──────────────────────────
const IRSDK_VER = 2;
const VAR_HEADER_SIZE = 144;

// ── Field / data layout ─────────────────────────────────────────────
interface FieldDef {
  /** iRacing variable name (null-terminated in the varHeader) */
  name: string;
  /** SDK type: 0=char,1=bool,2=int,4=float,5=double */
  type: number;
  /** byte offset within the data row */
  offset: number;
  /** value to write into data row */
  value: unknown;
}

/** Build a complete synthetic iRacing shared-memory buffer + expected output map. */
function buildSyntheticBuffer(
  fields: FieldDef[],
  options?: { ver?: number; status?: number },
): { buffer: Buffer; expected: Record<string, unknown> } {
  const ver = options?.ver ?? IRSDK_VER;
  const status = options?.status ?? 1;

  // ── Data row ─────────────────────────────────────────────────────
  // Find the max offset needed
  const maxOffset = Math.max(...fields.map((f) => {
    const size = f.type === 5 ? 8 : f.type === 2 || f.type === 4 ? 4 : 1;
    return f.offset + size;
  }), 0);
  const dataLen = Math.max(maxOffset, 256); // pad to 256 min

  const dataBuf = Buffer.alloc(dataLen, 0);
  const expected: Record<string, unknown> = {};

  for (const f of fields) {
    const { name, type, offset, value } = f;
    switch (type) {
      case 4: { // float
        const v = value as number;
        dataBuf.writeFloatLE(v, offset);
        if (name === 'LapLastLapTime' || name === 'LapBestLap' || name === 'LapBestLapTime') {
          expected[name] = v * 1000; // seconds → ms
        } else {
          expected[name] = v;
        }
        break;
      }
      case 2: { // int32
        const v = value as number;
        dataBuf.writeInt32LE(v, offset);
        expected[name] = v;
        break;
      }
      case 1: { // bool
        dataBuf.writeInt8(value ? 1 : 0, offset);
        expected[name] = value;
        break;
      }
      case 0: { // char (byte)
        dataBuf.writeInt8(value as number, offset);
        expected[name] = value;
        break;
      }
    }
  }

  // ── VarHeaders (144 bytes each) at offset 256 ──────────────────
  const varHeaderOffset = 256;
  const numVars = fields.length;
  const headersEnd = varHeaderOffset + numVars * VAR_HEADER_SIZE;

  // ── Full buffer ───────────────────────────────────────────────────
  const bufLen = headersEnd + dataLen;
  const buf = Buffer.alloc(bufLen, 0);

  // Header (112 bytes at offset 0)
  buf.writeInt32LE(ver, 0);
  buf.writeInt32LE(status, 4);
  buf.writeInt32LE(60, 8);    // tickRate
  buf.writeInt32LE(1, 12);    // sessionInfoUpdate
  buf.writeInt32LE(0, 16);    // sessionInfoLen
  buf.writeInt32LE(0, 20);    // sessionInfoOffset
  buf.writeInt32LE(numVars, 24);
  buf.writeInt32LE(varHeaderOffset, 28);
  buf.writeInt32LE(1, 32);    // numBuf = 1
  buf.writeInt32LE(dataLen, 36); // bufLen
  // padding at 40-47 (already zero)
  // varBuf[0] at offset 48
  buf.writeInt32LE(1, 48);         // tickCount
  buf.writeInt32LE(headersEnd, 52); // bufOffset = start of data row

  // ── Write VarHeaders ──────────────────────────────────────────────
  for (let i = 0; i < numVars; i++) {
    const base = varHeaderOffset + i * VAR_HEADER_SIZE;
    const f = fields[i];
    buf.writeInt32LE(f.type, base + 0);
    buf.writeInt32LE(f.offset, base + 4);
    buf.writeInt32LE(1, base + 8);     // count = 1 (scalar)
    buf.writeUInt8(0, base + 12);      // countAsTime = 0
    // name (32 bytes, null-terminated)
    buf.write(f.name, base + 16, 32, 'utf8');
    // desc (64 bytes) - skip
    // unit (32 bytes) - skip
  }

  // ── Write data row at headersEnd ──────────────────────────────────
  dataBuf.copy(buf, headersEnd, 0, dataLen);

  return { buffer: buf, expected };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('IRacingAdapter – parseSharedMemory integration', () => {
  const adapter = new IRacingAdapter() as any;

  it('parses a valid synthetic buffer and returns expected field names & values', () => {
    const fields: FieldDef[] = [
      { name: 'Speed',               type: 4, offset: 0,   value: 180.0 },
      { name: 'RPM',                 type: 4, offset: 4,   value: 7500 },
      { name: 'Gear',                type: 2, offset: 8,   value: 4 },
      { name: 'Throttle',            type: 4, offset: 12,  value: 0.85 },
      { name: 'Brake',               type: 4, offset: 16,  value: 0.0 },
      { name: 'Clutch',              type: 4, offset: 20,  value: 0.0 },
      { name: 'SteeringWheelAngle',  type: 4, offset: 24,  value: 0.1 },
      { name: 'Lap',                 type: 2, offset: 28,  value: 3 },
      { name: 'LapDist',             type: 4, offset: 32,  value: 1250.5 },
      { name: 'LapLastLapTime',      type: 4, offset: 36,  value: 95.0 },   // seconds → ms
      { name: 'LapBestLapTime',      type: 4, offset: 40,  value: 93.5 },   // seconds → ms
      { name: 'FuelLevel',           type: 4, offset: 44,  value: 45.2 },
      { name: 'FuelCapacity',        type: 4, offset: 48,  value: 100.0 },
      { name: 'FuelPress',           type: 4, offset: 52,  value: 55.0 },
      { name: 'WaterTemp',           type: 4, offset: 56,  value: 85.0 },
      { name: 'OilTemp',             type: 4, offset: 60,  value: 95.0 },
      { name: 'OilPressure',         type: 4, offset: 64,  value: 60.0 },
      { name: 'EngineWarnings',      type: 2, offset: 68,  value: 0 },
      { name: 'AirTemp',             type: 4, offset: 72,  value: 25.0 },
      { name: 'TrackTemp',           type: 4, offset: 76,  value: 30.0 },
      { name: 'WindVel',             type: 4, offset: 80,  value: 5.0 },
      { name: 'WindDir',             type: 4, offset: 84,  value: 180.0 },
      { name: 'SessionTime',         type: 4, offset: 88,  value: 150.5 },
      { name: 'SessionTimeRemain',   type: 4, offset: 92,  value: 3600.0 },
      { name: 'PlayerCarPosition',   type: 2, offset: 96,  value: 2 },
      { name: 'PlayerCarClassPosition', type: 2, offset: 100, value: 1 },
      { name: 'PlayerTrackSurface',  type: 2, offset: 104, value: 0 }, // 0 = on track
      { name: 'RelativeHumidity',    type: 4, offset: 108, value: 50.0 },
      { name: 'SessionLapsTotal',    type: 2, offset: 112, value: 30 },
    ];

    const { buffer, expected } = buildSyntheticBuffer(fields);

    // Reset the adapter's internal varHeader cache so parseSharedMemory
    // re-parses varHeaders on this call.
    adapter.varHeaders = null;
    adapter.cachedSessionInfoUpdate = -1;

    const result = adapter.parseSharedMemory(buffer);
    expect(result).not.toBeNull();

    // ── Check field mapping ───────────────────────────────────────
    // Direct field verifications
    expect(result.speed).toBeCloseTo(180.0);
    expect(result.rpm).toBeCloseTo(7500);
    expect(result.gear).toBe(4);
    expect(result.throttle).toBeCloseTo(0.85);
    expect(result.brake).toBeCloseTo(0.0);
    expect(result.clutch).toBeCloseTo(0.0);
    expect(result.steering).toBeCloseTo(0.1);
    expect(result.lap).toBe(3);
    expect(result.lapDistance).toBeCloseTo(1250.5);
    expect(result.lastLaptime).toBeCloseTo(95_000);   // converted to ms
    expect(result.bestLaptime).toBeCloseTo(93_500);   // converted to ms
    expect(result.fuelLevel).toBeCloseTo(45.2);
    expect(result.fuelCapacity).toBeCloseTo(100.0);
    expect(result.fuelPressure).toBeCloseTo(55.0);
    expect(result.waterTemp).toBeCloseTo(85.0);
    expect(result.oilTemp).toBeCloseTo(95.0);
    expect(result.oilPressure).toBeCloseTo(60.0);
    expect(result.engineWarnings).toBe(0);
    expect(result.airTemp).toBeCloseTo(25.0);
    expect(result.trackTemp).toBeCloseTo(30.0);
    expect(result.windVel).toBeCloseTo(5.0);
    expect(result.windDir).toBeCloseTo(180.0);
    expect(result.sessionTime).toBeCloseTo(150.5);
    expect(result.sessionTimeRemain).toBeCloseTo(3600.0);
    expect(result.position).toBe(2);
    expect(result.classPosition).toBe(1);
    expect(result.relativeHumidity).toBeCloseTo(50.0);
    expect(result.totalLaps).toBe(30);

    // ── Derived fields ───────────────────────────────────────────
    // PlayerTrackSurface = 0 → isOnTrack = true, isInPit = false, isPitting = false
    expect(result.isOnTrack).toBe(true);
    expect(result.isInPit).toBe(false);
    expect(result.isPitting).toBe(false);
    // trackSurface should be deleted, not present
    expect(result.trackSurface).toBeUndefined();
    // onPitRoad should be deleted
    expect(result.onPitRoad).toBeUndefined();
    // estimatedLaptime from lapCurrentLapTime (not provided, so defaults to 0)
    expect(result.estimatedLaptime).toBe(0);
    // lapsComplete defaults to lap value since not provided
    expect(result.lapsComplete).toBe(3);
  });

  it('returns null for an empty/invalid buffer (< 112 bytes)', () => {
    // Reset cache
    adapter.varHeaders = null;
    adapter.cachedSessionInfoUpdate = -1;

    const tooShort = Buffer.alloc(50, 0);
    expect(adapter.parseSharedMemory(tooShort)).toBeNull();

    const empty = Buffer.alloc(0);
    expect(adapter.parseSharedMemory(empty)).toBeNull();
  });

  it('returns null when the version field (ver) does not match IRSDK_VER', () => {
    const fields: FieldDef[] = [
      { name: 'Speed', type: 4, offset: 0, value: 180 },
    ];
    const { buffer } = buildSyntheticBuffer(fields, { ver: 99, status: 1 });

    adapter.varHeaders = null;
    adapter.cachedSessionInfoUpdate = -1;

    const result = adapter.parseSharedMemory(buffer);
    expect(result).toBeNull();
  });

  it('returns null when status bit 0 (connected) is not set', () => {
    const fields: FieldDef[] = [
      { name: 'Speed', type: 4, offset: 0, value: 180 },
    ];
    const { buffer } = buildSyntheticBuffer(fields, { ver: IRSDK_VER, status: 0 });

    adapter.varHeaders = null;
    adapter.cachedSessionInfoUpdate = -1;

    const result = adapter.parseSharedMemory(buffer);
    expect(result).toBeNull();
  });

  it('handles PlayerTrackSurface = 1 (pit road) correctly', () => {
    const fields: FieldDef[] = [
      { name: 'PlayerTrackSurface', type: 2, offset: 0, value: 1 },
      { name: 'Speed', type: 4, offset: 4, value: 50 },
    ];
    const { buffer } = buildSyntheticBuffer(fields);

    adapter.varHeaders = null;
    adapter.cachedSessionInfoUpdate = -1;

    const result = adapter.parseSharedMemory(buffer);
    expect(result).not.toBeNull();
    expect(result.isOnTrack).toBe(false);
    expect(result.isInPit).toBe(true);
    expect(result.isPitting).toBe(true);
  });

  it('fills defaults for missing fields', () => {
    // Only provide a few fields, the rest should get defaults
    const fields: FieldDef[] = [
      { name: 'Speed', type: 4, offset: 0, value: 200 },
      { name: 'RPM', type: 4, offset: 4, value: 6000 },
    ];
    const { buffer } = buildSyntheticBuffer(fields);

    adapter.varHeaders = null;
    adapter.cachedSessionInfoUpdate = -1;

    const result = adapter.parseSharedMemory(buffer);
    expect(result).not.toBeNull();
    // Provided fields
    expect(result.speed).toBeCloseTo(200);
    expect(result.rpm).toBeCloseTo(6000);
    // Default fields
    expect(result.lastLaptime).toBe(0);
    expect(result.bestLaptime).toBe(0);
    expect(result.fuelLevel).toBe(0);
    expect(result.engineWarnings).toBe(0);
    expect(result.estimatedLaptime).toBe(0);
    expect(result.lapDelta).toBe(0);
    expect(result.isPersonalBest).toBe(false);
    expect(result.isSessionBest).toBe(false);
    expect(result.relativeHumidity).toBe(0);
  });
});
