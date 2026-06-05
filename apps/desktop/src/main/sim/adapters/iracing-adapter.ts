import * as koffi from 'koffi';
import type { SimAdapter, Telemetry } from '@vantare/sim-core';
import { SimNormalizer } from '@vantare/sim-core';

const MEMORY_NAME = 'Local\\IRSDKMemMapFileName';
const MEMORY_SIZE = 1164 * 1024;
const POLL_INTERVAL_MS = 1000 / 60;

// ── iRacing SDK constants ──────────────────────────────────────────
const IRSDK_VER = 2;
/** Number of var-buf slots (triple/quad buffering) */
const NUM_BUF_SLOTS = 4;
/** Size of one VarHeader in bytes */
const VAR_HEADER_SIZE = 144;
/** Offset of var_buf[0] inside the 112-byte header */
const VAR_BUF_OFFSET = 48;
/** Bytes per var_buf slot */
const VAR_BUF_STRIDE = 16;

// ── Var-buf index helpers (each slot = 16 bytes at offset 48 + n*16) ──
function varBufTickCountOffset(slot: number): number {
  return VAR_BUF_OFFSET + slot * VAR_BUF_STRIDE;         // int32
}
function varBufBufOffset(slot: number): number {
  return VAR_BUF_OFFSET + slot * VAR_BUF_STRIDE + 4;     // int32
}

// ── VarHeader structure ─────────────────────────────────────────
interface VarHeader {
  type: number;        // 0=char, 1=bool, 2=int, 3=bitField, 4=float, 5=double
  offset: number;      // offset from start of buffer row
  count: number;       // array length (1 = scalar)
  countAsTime: number; // uint8
  name: string;        // null-terminated, max 32 chars
  desc: string;        // max 64 chars
  unit: string;        // max 32 chars
}

export class IRacingAdapter implements SimAdapter {
  readonly name = 'iracing';
  readonly displayName = 'iRacing';
  private normalizer = new SimNormalizer();
  private telemetryCallback?: (data: Telemetry) => void;
  private sessionCallback?: (data: Telemetry) => void;
  private connectionCallback?: (state: string) => void;
  private pollInterval?: ReturnType<typeof setInterval>;
  private lib?: ReturnType<typeof koffi.load>;
  private OpenFileMappingA!: ReturnType<ReturnType<typeof koffi.load>['func']>;
  private MapViewOfFile!: ReturnType<ReturnType<typeof koffi.load>['func']>;
  private UnmapViewOfFile!: ReturnType<ReturnType<typeof koffi.load>['func']>;
  private CloseHandle!: ReturnType<ReturnType<typeof koffi.load>['func']>;
  private hMapFile?: bigint;
  private pBuf?: Buffer;
  private connected = false;

  // ── Cached var headers ──────────────────────────────────────────
  /** Parsed VarHeader array (null = not yet parsed / stale) */
  private varHeaders: VarHeader[] | null = null;
  /** Last known session_info_update value – when it changes we re-parse */
  private cachedSessionInfoUpdate = -1;

  // ── Var name → output field map ─────────────────────────────────
  /**
   * Maps iRacing telemetry variable names to the field names expected
   * by `extractIRacing()` in the normalizer.
   */
  private static readonly FIELD_MAP: Record<string, string> = {
    Speed: 'speed',
    RPM: 'rpm',
    Gear: 'gear',
    Throttle: 'throttle',
    Brake: 'brake',
    Clutch: 'clutch',
    SteeringWheelAngle: 'steering',

    Lap: 'lap',
    LapDist: 'lapDistance',
    LapLastLapTime: 'lastLaptime',
    LapBestLap: 'bestLaptime',
    LapBestLapTime: 'bestLaptime',

    FuelLevel: 'fuelLevel',
    FuelCapacity: 'fuelCapacity',
    FuelPress: 'fuelPressure',

    WaterTemp: 'waterTemp',
    OilTemp: 'oilTemp',
    OilPress: 'oilPressure',
    OilPressure: 'oilPressure',

    EngineWarnings: 'engineWarnings',

    AirTemp: 'airTemp',
    TrackTemp: 'trackTemp',
    TrackTempCrew: 'trackTemp',
    WindVel: 'windVel',
    WindDir: 'windDir',

    SessionTime: 'sessionTime',
    SessionTimeRemain: 'sessionTimeRemain',

    PlayerCarPosition: 'position',
    PlayerCarClassPosition: 'classPosition',

    OnPitRoad: 'onPitRoad',
    PlayerTrackSurface: 'trackSurface',

    LapDeltaToBestLap: 'lapDelta',
    LapDeltaToSessionBestLap: 'lapDelta',
    LapDeltaToSessionOptimalLap: 'lapDelta',

    RelativeHumidity: 'relativeHumidity',

    SessionLapsTotal: 'totalLaps',
    CarIdxLapCompleted: 'lapsComplete',

    LapCurrentLapTime: 'lapCurrentLapTime',
  };

  isAvailable(): boolean { return true; }

  async connect(): Promise<void> {
    try {
      this.lib ??= koffi.load('kernel32.dll');
      this.OpenFileMappingA = this.lib.func('void* OpenFileMappingA(uint32, bool, string)');
      this.MapViewOfFile = this.lib.func('void* MapViewOfFile(void*, uint32, uint32, uint32, size_t)');
      this.UnmapViewOfFile = this.lib.func('bool UnmapViewOfFile(void*)');
      this.CloseHandle = this.lib.func('bool CloseHandle(void*)');

      const nameBuffer = Buffer.from(MEMORY_NAME + '\0');
      const FILE_MAP_READ = 0x0004;

      const hMap = this.OpenFileMappingA(FILE_MAP_READ, false, nameBuffer);
      if (!hMap) {
        throw new Error('iRacing shared memory not found. Is iRacing running?');
      }
      this.hMapFile = hMap;

      const pBuf = this.MapViewOfFile(hMap, FILE_MAP_READ, 0, 0, MEMORY_SIZE);
      if (!pBuf) {
        this.CloseHandle(hMap);
        throw new Error('Failed to map iRacing shared memory view');
      }

      const view = koffi.view(pBuf, MEMORY_SIZE);
      this.pBuf = Buffer.from(view);

      this.connected = true;
      this.connectionCallback?.('connected');
      this.startPolling();
    } catch (err) {
      console.error('iRacing adapter connect error:', err);
      this.connectionCallback?.('error');
      throw err;
    }
  }

  disconnect(): void {
    this.stopPolling();
    this.closeSharedMemory();
    this.connected = false;
    this.varHeaders = null;
    this.cachedSessionInfoUpdate = -1;
    this.connectionCallback?.('disconnected');
  }

  onTelemetry(callback: (data: Telemetry) => void): () => void {
    this.telemetryCallback = callback;
    return () => { this.telemetryCallback = undefined; };
  }

  onSessionData(callback: (data: Telemetry) => void): () => void {
    this.sessionCallback = callback;
    return () => { this.sessionCallback = undefined; };
  }

  onConnectionState(callback: (state: string) => void): () => void {
    this.connectionCallback = callback;
    return () => { this.connectionCallback = undefined; };
  }

  destroy(): void {
    this.disconnect();
    this.telemetryCallback = undefined;
    this.sessionCallback = undefined;
    this.connectionCallback = undefined;
  }

  private closeSharedMemory = (): void => {
    try {
      if (this.pBuf && this.hMapFile) {
        this.UnmapViewOfFile(this.pBuf);
        this.CloseHandle(this.hMapFile);
        this.pBuf = undefined;
        this.hMapFile = undefined;
      }
    } catch (err) {
      console.error('Error closing iRacing shared memory:', err);
    }
  };

  private startPolling = (): void => {
    this.pollInterval = setInterval(() => {
      if (this.pBuf && this.connected) {
        try {
          const raw = this.parseSharedMemory(this.pBuf);
          if (raw) {
            const telemetry = this.normalizer.normalize(raw, 'iracing');
            this.telemetryCallback?.(telemetry);
          }
        } catch (err) {
          console.error('Error polling iRacing shared memory:', err);
        }
      }
    }, POLL_INTERVAL_MS);
  };

  private stopPolling = (): void => {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  Shared memory parsing – varHeader lookup
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Parse the 112-byte header at offset 0.
   * Returns parsed header fields or null if invalid.
   */
  private parseHeader(buf: Buffer): {
    ver: number;
    status: number;
    tickRate: number;
    sessionInfoUpdate: number;
    sessionInfoLen: number;
    sessionInfoOffset: number;
    numVars: number;
    varHeaderOffset: number;
    numBuf: number;
    bufLen: number;
    varBuf: { tickCount: number; bufOffset: number }[];
  } | null {
    if (buf.length < 112) return null;

    const ver = buf.readInt32LE(0);
    if (ver !== IRSDK_VER) return null;

    const numVars = buf.readInt32LE(24);
    if (numVars <= 0 || numVars > 2000) return null;

    const numBuf = buf.readInt32LE(32);
    if (numBuf < 1 || numBuf > NUM_BUF_SLOTS) return null;

    const varHeaderOffset = buf.readInt32LE(28);
    if (varHeaderOffset <= 0 || varHeaderOffset >= buf.length) return null;

    const bufLen = buf.readInt32LE(36);
    if (bufLen <= 0) return null;

    // Read var-buf slots
    const varBuf: { tickCount: number; bufOffset: number }[] = [];
    for (let i = 0; i < numBuf; i++) {
      const tickCount = buf.readInt32LE(varBufTickCountOffset(i));
      const bOff = buf.readInt32LE(varBufBufOffset(i));
      varBuf.push({ tickCount, bufOffset: bOff >= 0 ? bOff : 0 });
    }

    return {
      ver,
      status: buf.readInt32LE(4),
      tickRate: buf.readInt32LE(8),
      sessionInfoUpdate: buf.readInt32LE(12),
      sessionInfoLen: buf.readInt32LE(16),
      sessionInfoOffset: buf.readInt32LE(20),
      numVars,
      varHeaderOffset,
      numBuf,
      bufLen,
      varBuf,
    };
  }

  /**
   * Parse the VarHeader array starting at `varHeaderOffset`.
   * Each VarHeader is 144 bytes.
   */
  private parseVarHeaders(buf: Buffer, varHeaderOffset: number, numVars: number): VarHeader[] {
    const headers: VarHeader[] = [];
    for (let i = 0; i < numVars; i++) {
      const base = varHeaderOffset + i * VAR_HEADER_SIZE;
      if (base + 144 > buf.length) break;

      const type = buf.readInt32LE(base + 0);
      const offset = buf.readInt32LE(base + 4);
      const count = buf.readInt32LE(base + 8);
      const countAsTime = buf.readUInt8(base + 12);
      const name = this.readString(buf, base + 16, 32);
      const desc = this.readString(buf, base + 48, 64);
      const unit = this.readString(buf, base + 112, 32);

      headers.push({ type, offset, count, countAsTime, name, desc, unit });
    }
    return headers;
  }

  /**
   * Read a value from the telemetry buffer given a VarHeader entry.
   */
  private readVarValue(
    buf: Buffer,
    bufOffset: number,
    header: VarHeader,
    entryIndex = 0,
  ): unknown {
    const absOffset = bufOffset + header.offset;
    // For array variables, offset advances by size * entryIndex.
    let finalOffset = absOffset;
    if (header.count > 1 && entryIndex > 0) {
      const elemSize = this.varTypeSize(header.type);
      finalOffset = absOffset + elemSize * entryIndex;
    }
    return this.readTypedValue(buf, finalOffset, header.type);
  }

  /**
   * Return the byte size of a single element of the given var type.
   */
  private varTypeSize(type: number): number {
    switch (type) {
      case 0:  return 1; // char
      case 1:  return 1; // bool
      case 2:  return 4; // int
      case 3:  return 4; // bitField
      case 4:  return 4; // float
      case 5:  return 8; // double
      default: return 4;
    }
  }

  /**
   * Read a typed value from the buffer at the given offset.
   */
  private readTypedValue(buf: Buffer, offset: number, type: number): unknown {
    if (offset < 0 || offset + this.varTypeSize(type) > buf.length) return undefined;

    switch (type) {
      case 0: // char – return as number (byte value)
        return buf.readInt8(offset);
      case 1: // bool
        return buf.readInt8(offset) !== 0;
      case 2: // int
        return buf.readInt32LE(offset);
      case 3: // bitField – return raw int
        return buf.readInt32LE(offset);
      case 4: // float
        return buf.readFloatLE(offset);
      case 5: // double
        return buf.readDoubleLE(offset);
      default:
        return undefined;
    }
  }

  /**
   * Build the output record compatible with `extractIRacing()`.
   * Looks up each needed field by iRacing variable name → reads its value.
   */
  private buildOutput(
    buf: Buffer,
    bufOffset: number,
    headers: VarHeader[],
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const headerByName = this.buildNameIndex(headers);

    // ── Process each mapped field ──────────────────────────────────
    for (const [irVarName, outField] of Object.entries(IRacingAdapter.FIELD_MAP)) {
      const hdr = headerByName[irVarName];
      if (!hdr) continue; // variable not available this session

      let value: unknown;
      if (irVarName === 'CarIdxLapCompleted') {
        // Array variable – read the first element as a sample
        value = this.readVarValue(buf, bufOffset, hdr, 0);
      } else {
        value = this.readVarValue(buf, bufOffset, hdr, 0);
      }

      if (value !== undefined) {
        // Convert LapLastLapTime / LapBestLap from seconds to ms
        if (irVarName === 'LapLastLapTime' || irVarName === 'LapBestLap' || irVarName === 'LapBestLapTime') {
          if (typeof value === 'number') {
            value = value * 1000;
          }
        }
        data[outField] = value;
      }
    }

    // ── Derived fields ─────────────────────────────────────────────
    // isOnTrack / isInPit / isPitting from PlayerTrackSurface
    const trackSurface = data['trackSurface'];
    if (typeof trackSurface === 'number') {
      data['isOnTrack'] = trackSurface === 0;
      data['isInPit'] = trackSurface >= 1;
      data['isPitting'] = trackSurface === 1;
    } else {
      data['isOnTrack'] = true;
      data['isInPit'] = false;
      data['isPitting'] = false;
    }
    delete data['trackSurface'];

    // onPitRoad → isInPit (backup)
    const onPitRoad = data['onPitRoad'];
    if (typeof onPitRoad === 'number') {
      if (trackSurface === undefined) {
        data['isInPit'] = onPitRoad !== 0;
        data['isPitting'] = onPitRoad !== 0;
        data['isOnTrack'] = onPitRoad === 0;
      }
    }
    delete data['onPitRoad'];

    // lapCurrentLapTime → estimatedLaptime (rough approximation)
    const lapCurrentTime = data['lapCurrentLapTime'];
    if (typeof lapCurrentTime === 'number' && lapCurrentTime > 0) {
      data['estimatedLaptime'] = lapCurrentTime * 1000; // convert to ms
    } else if (data['estimatedLaptime'] === undefined) {
      data['estimatedLaptime'] = 0;
    }
    delete data['lapCurrentLapTime'];

    // Provide defaults for fields that extractIRacing always reads
    if (data['lapsComplete'] === undefined && typeof data['lap'] === 'number') {
      data['lapsComplete'] = data['lap'];
    }
    if (data['lastLaptime'] === undefined) data['lastLaptime'] = 0;
    if (data['bestLaptime'] === undefined) data['bestLaptime'] = 0;
    if (data['fuelLevel'] === undefined) data['fuelLevel'] = 0;
    if (data['fuelCapacity'] === undefined) data['fuelCapacity'] = 0;
    if (data['fuelPressure'] === undefined) data['fuelPressure'] = 0;
    if (data['engineWarnings'] === undefined) data['engineWarnings'] = 0;
    if (data['maxRpm'] === undefined) data['maxRpm'] = data['rpm'] ?? 0;
    if (data['lapDelta'] === undefined) data['lapDelta'] = 0;
    if (data['isPersonalBest'] === undefined) data['isPersonalBest'] = false;
    if (data['isSessionBest'] === undefined) data['isSessionBest'] = false;
    if (data['relativeHumidity'] === undefined) data['relativeHumidity'] = 0;
    if (data['sessionTimeRemain'] === undefined) data['sessionTimeRemain'] = 0;
    if (data['totalLaps'] === undefined) data['totalLaps'] = 0;
    if (data['sessionType'] === undefined) data['sessionType'] = '';
    if (data['sessionState'] === undefined) data['sessionState'] = '';
    if (data['sector'] === undefined) data['sector'] = 0;
    if (data['sector1'] === undefined) data['sector1'] = 0;
    if (data['sector2'] === undefined) data['sector2'] = 0;
    if (data['sector3'] === undefined) data['sector3'] = 0;
    if (data['trackName'] === undefined) data['trackName'] = '';
    if (data['trackLength'] === undefined) data['trackLength'] = 0;
    if (data['driverName'] === undefined) data['driverName'] = '';
    if (data['carNumber'] === undefined) data['carNumber'] = '';
    if (data['teamName'] === undefined) data['teamName'] = '';

    return data;
  }

  /**
   * Build a fast name → VarHeader lookup map.
   */
  private buildNameIndex(headers: VarHeader[]): Record<string, VarHeader> {
    const index: Record<string, VarHeader> = {};
    for (const h of headers) {
      index[h.name] = h;
    }
    return index;
  }

  /**
   * Main parse entry point.
   *
   * Algorithm:
   * 1. Parse 112-byte header at offset 0
   * 2. Detect irsdk version – return null if incompatible
   * 3. Select varBuf with highest tick_count (triple-buffering)
   * 4. Parse / refresh cached VarHeader array when session_info_update changes
   * 5. Build output Record<string, unknown> via name-based lookup
   */
  private parseSharedMemory(buf: Buffer): Record<string, unknown> | null {
    try {
      // ── Step 1: Parse header ──────────────────────────────────
      const header = this.parseHeader(buf);
      if (!header) return null;

      // ── Step 2: Check connection status ───────────────────────
      // Bit 0 of status indicates connected
      if (!(header.status & 0x1)) return null;

      // ── Step 3: Select latest buffer ──────────────────────────
      let bestSlot = 0;
      let bestTick = header.varBuf[0].tickCount;
      for (let i = 1; i < header.numBuf; i++) {
        if (header.varBuf[i].tickCount > bestTick) {
          bestTick = header.varBuf[i].tickCount;
          bestSlot = i;
        }
      }
      const { bufOffset } = header.varBuf[bestSlot];

      // ── Step 4: Refresh varHeader cache on session_info_update change ──
      if (
        this.varHeaders === null ||
        header.sessionInfoUpdate !== this.cachedSessionInfoUpdate
      ) {
        this.varHeaders = this.parseVarHeaders(buf, header.varHeaderOffset, header.numVars);
        this.cachedSessionInfoUpdate = header.sessionInfoUpdate;
      }

      // ── Step 5: Build output via name-based lookup ────────────
      return this.buildOutput(buf, bufOffset, this.varHeaders);
    } catch (err) {
      console.error('Error parsing iRacing shared memory:', err);
      return null;
    }
  }

  private readString(buf: Buffer, offset: number, maxLen: number): string {
    if (offset >= buf.length) return '';
    const end = Math.min(offset + maxLen, buf.length);
    const bytes = buf.subarray(offset, end);
    const nullIdx = bytes.indexOf(0);
    if (nullIdx >= 0) {
      const str = bytes.subarray(0, nullIdx).toString('utf8');
      // Remove any remaining control characters
      return str.replace(/[\x00-\x1f]/g, '').trim();
    }
    return bytes.toString('utf8').trim();
  }
}
