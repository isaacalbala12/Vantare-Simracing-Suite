# Sprint 5A — Multi-Sim Learnings

## T6 — NDJSON Streaming Recorder + Replay Reader

### Files created

- apps/desktop/src/main/sim/telemetry-recorder.ts — TelemetryRecorder class
  - Uses fs.createWriteStream for streaming NDJSON (no in-memory buffering)
  - Metadata header line (version, sim, startedAt) + one JSON line per Telemetry frame
  - Records to userData/recordings/{sim}-{timestamp}.ndjson
  - startRecording(sim) returns file path
  - writeFrame(data) appends one NDJSON line
  - stopRecording() flushes stream, returns file path
  - isRecording getter

- packages/sim-core/src/replay/replay-reader.ts — ReplayReader class
  - ReplayReader.open(filePath) async, returns Promise<Telemetry[]>
  - Uses fs.createReadStream + readline.createInterface for streaming parse
  - Skips metadata header (first line) and empty lines
  - Handles truncated last line gracefully (catches JSON.parse error, breaks)
  - No in-memory accumulation beyond the result array

- packages/sim-core/src/replay/index.ts — barrel export

- packages/sim-core/src/replay/__tests__/replay-reader.test.ts — 4 tests
  - Round-trip: write -> read back -> deep equal
  - Truncated last line: returns 3 frames (not 4, no crash)
  - Empty file (metadata only): returns empty array
  - Empty lines skipped: blank lines between frames ignored

### Package.json change

Added "./replay" export path to packages/sim-core/package.json.

### Decisions

- Metadata header format: {"version": 1, "sim": "...", "startedAt": epoch}
- Recorder uses app.getPath('userData')/recordings/ for storage
- ReplayReader catches JSON.parse errors on truncated lines, breaks silently

## T5 — AC UDP Handshaker Protocol

### Files modified

- apps/desktop/src/main/sim/adapters/ac-adapter.ts — full rewrite of connect/parse flow

### Handshake flow

1. `socket.bind()` → sends 12-byte handshake `[0,0,0,0, 1,0,0,0, 0,0,0,0]` (identifier=0, version=1, HANDSHAKE=0)
2. Waits for 408-byte handshake response with 5s timeout
3. Parses 408-byte response: carName (offset 0, 100 bytes UTF-16LE), driverName (offset 100, 100 bytes), identifier (offset 200), version (offset 204), trackName (offset 208, 100 bytes), trackConfig (offset 308, 100 bytes)
4. Sends subscribe `[0,0,0,0, 1,0,0,0, 1,0,0,0]` (SUBSCRIBE_UPDATE=1)
5. Begins parsing 328-byte RT_CAR_INFO packets

### Packet structure

- Handshake protocol uses 12-byte packets: int32LE identifier, int32LE version, int32LE operation
- RT_CAR_INFO (328 bytes): charId+pad(4) + size(4) + speedKmh(8)/float + ... + gear(76)/int32 + cgHeight(80) + fuel(84)
- Fields mapped for extractAC(): speedKmh→speedKmh, engineRPM→rpm, gear→gear, gas→gas, brake→brake, clutch→clutch, steer→steerAngle, lastLap→lastLap(ms), bestLap→bestLap(ms), lapCount→numberOfLaps, isInPit(byte)→bool, lapTime→lap
- UTF-16LE null-terminated strings decoded via custom decoder (walks 2-byte pairs until null)

### Key implementation details

- `connect()` resolves after handshake completes (or after 5s timeout if no response)
- `handlePacket()` guards on `handshakeComplete` — drops packets arriving before handshake
- `disconnect()` sends DISMISS (operation=3) before closing socket
- Session info (track name, car name) emitted via `sessionCallback` after handshake
- `connectResolve` captured as class field so `handleHandshakeResponse()` can resolve the connect Promise

## T4 — iRacing varHeader Shared Memory Reader

### Files modified

- `apps/desktop/src/main/sim/adapters/iracing-adapter.ts` — full rewrite of `parseSharedMemory()`

### Added dependency

- `koffi` added to `@vantare/desktop` package.json (was imported but missing from deps)

### Shared memory structure

| Region | Size | Bytes |
|---|---|---|
| Header | 112 | 0–111 |
| Session info YAML | variable | from header.sessionInfoOffset |
| VarHeader array | numVars × 144 | from header.varHeaderOffset |
| Var buffers | bufLen × numBuf | from varBuf[n].bufOffset |

### Header layout (112 bytes at offset 0)

```
Offset  Size  Field
0       4     ver (int32) — must be 2 (IRSDK_VER)
4       4     status (int32) — bit 0 = connected
8       4     tick_rate (int32)
12      4     session_info_update (int32) — bump counter
16      4     session_info_len (int32)
20      4     session_info_offset (int32)
24      4     num_vars (int32)
28      4     var_header_offset (int32)
32      4     num_buf (int32) — ≤ 4
36      4     buf_len (int32)
40      8     pad[2]
48      64    var_buf[4] — each 16 bytes
```

### VarHeader layout (144 bytes each)

```
Offset  Size  Field
0       4     type (int32): 0=char, 1=bool, 2=int, 3=bitField, 4=float, 5=double
4       4     offset (int32) — offset from start of buffer row
8       4     count (int32) — array length (1 = scalar)
12      1     count_as_time (uint8)
13      3     pad
16      32    name[32] — null-terminated ASCII
48      64    desc[64] — null-terminated
112     32    unit[32] — null-terminated
```

### Var-buf slot layout (each 16 bytes, 4 slots starting at header offset 48)

```
Offset  Size  Field
0       4     tick_count (int32)
4       4     buf_offset (int32)
8       8     pad (int32[2])
```

### Algorithm

1. **Parse header** (112 bytes at offset 0) — verify ver=2, status bit 0, extract numVars, varHeaderOffset, numBuf, varBuf[4]
2. **Select latest buffer** — sort varBuf[0..numBuf-1] by tick_count descending, pick highest
3. **Parse/refresh varHeader cache** — parse VarHeader array at varHeaderOffset only when `session_info_update` changes
4. **Build output via name lookup** — for each mapped field (FIELD_MAP: `Speed → speed`, `RPM → rpm`, etc.), find VarHeader by name, read value at `buf[bufOffset + varHeader.offset]`

### Field name mapping

The `IRacingAdapter.FIELD_MAP` maps iRacing telemetry variable names → `extractIRacing()` field names:

| iRacing Var | Output Field | Type | Notes |
|---|---|---|---|
| Speed | speed | float | m/s |
| RPM | rpm | float | |
| Gear | gear | int | -1=R, 0=N |
| Throttle | throttle | float 0–1 | |
| Brake | brake | float 0–1 | |
| Clutch | clutch | float 0–1 | |
| SteeringWheelAngle | steering | float | radians |
| Lap | lap | int | laps completed |
| LapDist | lapDistance | float | meters |
| LapLastLapTime | lastLaptime | float | converted to ms |
| LapBestLap / LapBestLapTime | bestLaptime | float | converted to ms |
| FuelLevel | fuelLevel | float | |
| FuelCapacity | fuelCapacity | float | |
| FuelPress | fuelPressure | float | |
| WaterTemp | waterTemp | float | °C |
| OilTemp | oilTemp | float | °C |
| OilPress / OilPressure | oilPressure | float | psi |
| AirTemp | airTemp | float | °C |
| TrackTemp / TrackTempCrew | trackTemp | float | °C |
| WindVel | windVel | float | m/s |
| WindDir | windDir | float | radians |
| SessionTime | sessionTime | float | seconds |
| SessionTimeRemain | sessionTimeRemain | float | seconds |
| PlayerCarPosition | position | int | 1-based |
| PlayerCarClassPosition | classPosition | int | 1-based |
| PlayerTrackSurface | isOnTrack/isInPit/isPitting | derived | 0=track, 1=pit road, 2=pit stall |
| LapDeltaToBestLap | lapDelta | float | seconds |
| RelativeHumidity | relativeHumidity | float | % |
| SessionLapsTotal | totalLaps | int | |
| EngineWarnings | engineWarnings | int | |
| LapCurrentLapTime | estimatedLaptime | float | converted to ms |

### Caching strategy

- VarHeader array parsed once and cached in `this.varHeaders: VarHeader[] | null`
- Re-parsed only when `session_info_update` (4-byte counter at header offset 12) changes
- `cachedSessionInfoUpdate` tracks last known value; cache is invalidated on disconnect

### Key learnings

- iRacing shared memory provides telem vars via name-based lookup — hardcoded offsets are fragile across SDK versions
- Triple-buffering with `tick_count` comparison ensures we read the most recent complete frame
- Driver name, car number, and team name are NOT available as telemetry variables — they come from session info YAML. The adapter defaults them to empty strings; `SimNormalizer` falls back to defaults.
- `koffi` was imported but missing from package.json dependencies — had to add it
- The `extractIRacing()` normalizer expects `windVel` (not `windSpeed`) and `windDir` — matches iRacing SDK var names directly
- Tire data (LF/RF/LR/RR with temp/pressure/wear) is complex structured data not directly available as simple telemetry vars; normalizer fills in defaults
