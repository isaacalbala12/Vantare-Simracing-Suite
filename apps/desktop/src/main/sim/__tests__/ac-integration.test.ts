import { describe, it, expect } from 'vitest';
import { ACAdapter } from '../adapters/ac-adapter';

/**
 * Build a synthetic 328-byte RT_CAR_INFO UDP packet.
 *
 * Field layout (from ACAdapter.parseACPacket comments):
 *   Offset  Size  Type    Field
 *   0       4     int32   charId + pad
 *   4       4     int32   packet size
 *   8       4     float   speedKmh
 *   12      4     float   speedMph
 *   16      4     float   speedMs
 *   20      1     byte    isAbsEnabled
 *   21      1     byte    isAbsInAction
 *   22      1     byte    isTcInAction
 *   23      1     byte    isTcEnabled
 *   24      1     byte    isInPit
 *   25      1     byte    isEngineLimiterOn
 *   26      2     ——      SKIP
 *   28      4     float   accGVertical
 *   32      4     float   accGHorizontal
 *   36      4     float   accGFrontal
 *   40      4     int32   lapTime (ms)
 *   44      4     int32   lastLap (ms)
 *   48      4     int32   bestLap (ms)
 *   52      4     int32   lapCount
 *   56      4     float   gas (0-1)
 *   60      4     float   brake (0-1)
 *   64      4     float   clutch (0-1)
 *   68      4     float   engineRPM
 *   72      4     float   steer (-1 to 1)
 *   76      4     int32   gear
 *   80      4     int32   cgHeight
 *   84      4     float   fuel (liters)
 */
function buildACPacket(overrides?: Partial<Record<string, unknown>>): Buffer {
  const buf = Buffer.alloc(328, 0);

  // Default values
  buf.writeInt32LE(0, 0);          // charId + pad
  buf.writeInt32LE(328, 4);        // packet size
  buf.writeFloatLE(210.0, 8);      // speedKmh
  buf.writeFloatLE(130.5, 12);     // speedMph
  buf.writeFloatLE(58.3, 16);      // speedMs
  buf.writeUInt8(1, 20);           // isAbsEnabled
  buf.writeUInt8(0, 21);           // isAbsInAction
  buf.writeUInt8(0, 22);           // isTcInAction
  buf.writeUInt8(1, 23);           // isTcEnabled
  buf.writeUInt8(0, 24);           // isInPit
  buf.writeUInt8(0, 25);           // isEngineLimiterOn
  // skip 26-27
  buf.writeFloatLE(-9.81, 28);     // accGVertical
  buf.writeFloatLE(0.5, 32);       // accGHorizontal
  buf.writeFloatLE(0.3, 36);       // accGFrontal
  buf.writeInt32LE(95_000, 40);    // lapTime (ms)
  buf.writeInt32LE(94_200, 44);    // lastLap (ms)
  buf.writeInt32LE(93_500, 48);    // bestLap (ms)
  buf.writeInt32LE(3, 52);         // lapCount
  buf.writeFloatLE(0.75, 56);      // gas
  buf.writeFloatLE(0.2, 60);       // brake
  buf.writeFloatLE(0.0, 64);       // clutch
  buf.writeFloatLE(7200, 68);      // engineRPM
  buf.writeFloatLE(0.08, 72);      // steer
  buf.writeInt32LE(6, 76);         // gear
  buf.writeInt32LE(0, 80);         // cgHeight
  buf.writeFloatLE(35.0, 84);      // fuel

  // Apply overrides
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      switch (key) {
        case 'speedKmh':  buf.writeFloatLE(value as number, 8);  break;
        case 'engineRPM': buf.writeFloatLE(value as number, 68); break;
        case 'gear':      buf.writeInt32LE(value as number, 76); break;
        case 'gas':       buf.writeFloatLE(value as number, 56); break;
        case 'brake':     buf.writeFloatLE(value as number, 60); break;
        case 'clutch':    buf.writeFloatLE(value as number, 64); break;
        case 'steer':     buf.writeFloatLE(value as number, 72); break;
        case 'isInPit':   buf.writeUInt8(value ? 1 : 0, 24);    break;
        case 'lastLap':   buf.writeInt32LE(value as number, 44); break;
        case 'bestLap':   buf.writeInt32LE(value as number, 48); break;
        case 'lapCount':  buf.writeInt32LE(value as number, 52); break;
        case 'lapTime':   buf.writeInt32LE(value as number, 40); break;
        case 'fuel':      buf.writeFloatLE(value as number, 84); break;
      }
    }
  }

  return buf;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('ACAdapter – parseACPacket integration', () => {
  const adapter = new ACAdapter() as any;

  it('parses a valid 328-byte RT_CAR_INFO packet returns correct field values', () => {
    const packet = buildACPacket();
    const result = adapter.parseACPacket(packet);

    expect(result).not.toBeNull();

    // Player data
    expect(result.speedKmh).toBeCloseTo(210.0);
    expect(result.rpm).toBeCloseTo(7200);
    expect(result.gear).toBe(6);
    expect(result.gas).toBeCloseTo(0.75);
    expect(result.brake).toBeCloseTo(0.2);
    expect(result.clutch).toBeCloseTo(0.0);
    expect(result.steerAngle).toBeCloseTo(0.08);

    // Lap info
    expect(result.lastLap).toBe(94_200);
    expect(result.bestLap).toBe(93_500);
    expect(result.numberOfLaps).toBe(3);

    // State
    expect(result.isInPit).toBe(false);
    expect(result.isOnTrack).toBe(true);
    expect(result.isPitting).toBe(false);

    // Fuel
    expect(result.fuel).toBeCloseTo(35.0);
  });

  it('handles a car that is in the pit lane', () => {
    const packet = buildACPacket({ isInPit: true });
    const result = adapter.parseACPacket(packet);

    expect(result).not.toBeNull();
    expect(result.isInPit).toBe(true);
    expect(result.isOnTrack).toBe(true); // default
  });

  it('parses full-throttle, zero-brake scenario', () => {
    const packet = buildACPacket({ gas: 1.0, brake: 0.0, engineRPM: 8500, gear: 7 });
    const result = adapter.parseACPacket(packet);

    expect(result).not.toBeNull();
    expect(result.gas).toBeCloseTo(1.0);
    expect(result.brake).toBeCloseTo(0.0);
    expect(result.rpm).toBeCloseTo(8500);
    expect(result.gear).toBe(7);
  });

  it('returns null for too-short buffer', () => {
    const tooShort = Buffer.alloc(40, 0); // needs at least 80 bytes
    expect(adapter.parseACPacket(tooShort)).toBeNull();

    const empty = Buffer.alloc(0);
    expect(adapter.parseACPacket(empty)).toBeNull();
  });

  it('returns null for a buffer that is exactly 79 bytes', () => {
    const borderline = Buffer.alloc(79, 0);
    expect(adapter.parseACPacket(borderline)).toBeNull();
  });

  it('reads fuel when packet is large enough (≥ 88 bytes)', () => {
    // Even a minimal valid packet of exactly 80 bytes with no fuel area
    const minimal = Buffer.alloc(80, 0);
    minimal.writeInt32LE(0, 0);
    minimal.writeInt32LE(80, 4);
    // Fill enough fields to not crash
    minimal.writeFloatLE(100.0, 8);   // speedKmh
    minimal.writeFloatLE(5000, 68);   // rpm
    minimal.writeInt32LE(0, 76);      // gear
    minimal.writeFloatLE(0.5, 56);    // gas
    minimal.writeFloatLE(0.0, 60);    // brake
    minimal.writeFloatLE(0.0, 64);    // clutch
    minimal.writeFloatLE(0.0, 72);    // steer

    const result = adapter.parseACPacket(minimal);
    expect(result).not.toBeNull();
    expect(result.speedKmh).toBeCloseTo(100.0);
    expect(result.fuel).toBeUndefined(); // not read when < 88 bytes
  });
});
