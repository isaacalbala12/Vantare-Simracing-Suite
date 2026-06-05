# Sprint 5b — LMU Real Shared Memory Adapter

## TL;DR

> **Quick Summary**: Replace the current LMU adapter skeleton (wrong buffer size, guessed offsets) with a real shared memory parser. Uses Python `ctypes.sizeof()` offset generator, koffi for FFI, and full nested C struct navigation. Adds REST API polling for brake wear, weather, and strategy data. Full multi-vehicle scoring for Standings/Relative overlays. TDD throughout.
>
> **Deliverables**:
> - `tools/generate-lmu-offsets.py` — Python offset generator script
> - `tools/dump-lmu-memory.py` — Python MMAP dumper for real fixtures
> - `packages/sim-core/src/lmu-offsets.ts` — Generated offset constants
> - `packages/sim-core/src/lmu-parser.ts` — Real LMU struct parser
> - `apps/desktop/src/main/sim/adapters/lmu-adapter-v2.ts` — Real adapter (renamed to `lmu-adapter.ts` at end)
> - `apps/desktop/src/main/sim/lmu-rest-client.ts` — REST API polling (3 endpoints)
> - `test-data/lmu-fixture.bin` — Real LMU memory dump for testing
> - 25+ new tests across parser, adapter, REST client
>
> **Estimated Effort**: XL (20-25 tasks across 5 waves + final)
> **Parallel Execution**: YES — 5 waves + final
> **Critical Path**: T1 (offsets) → T6-T11 (parser) → T12 (adapter) → T18-T19 (integration)

---

## Context

### Original Request
"Vamos a planear extensamente el sprint 5b" — construir el adaptador real de Le Mans Ultimate shared memory.

### Interview Summary
**Key Discussions**:
- **Scope**: Full LMU shared memory parse (player telemetry + ALL vehicle scoring) + 3 REST API endpoints + Python offset generator
- **Approach**: Python `ctypes.sizeof()` on the actual `lmu_data.py` struct hierarchy → generate TypeScript offset constants
- **TDD**: RED → GREEN → REFACTOR per task, matches Sprint 5a workflow
- **Testing**: Both real fixture (Python mmap dump) + synthetic buffer constructed in TypeScript
- **Parallel file**: New `lmu-adapter-v2.ts` alongside skeleton `lmu-adapter.ts`; rename at end
- **classPosition**: Computed in parser by grouping vehicles by `mVehicleClass` and re-ranking

**Resolved Issues (Oracle Phase 1)**:
- **mLocalVel→speed**: sqrt(x²+y²+z²) computed in parser, normalizer untouched
- **mDriverName**: c_char*32 ASCII/UTF-8 (not UTF-16LE as skeleton assumed)
- **Vehicle sentinel**: mID >= 0 && mDriverName !== '' && mTotalLaps >= 0
- **REST API schemas**: 3 endpoints documented from Vantare-Ingeniero/LMU/rest-api.md
- **CI Python**: Offsets versioned in .ts, CI doesn't run generator

### Metis Review
**Identified Gaps** (addressed):
- **Gap 1**: speed computation location → resolved in parser, not normalizer
- **Gap 2**: classPosition need → resolved with grouping+re-ranking in parser
- **Gap 3**: driver name encoding → resolved as c_char (ASCII/UTF-8), not c_wchar/UTF-16LE
- **Gap 4**: REST API response schemas → documented from rest-api.md
- **Gap 5**: Benchmark at 325KB@16Hz → resolved as 5.2 MB/s, <5ms per tick
- **Gap 6**: CI dependency on Python → resolved by versioning generated output

---

## Work Objectives

### Core Objective
Replace the skeleton LMU adapter (guessed offsets, wrong buffer size) with a struct-accurate shared memory parser that extracts full player telemetry, all vehicle scoring data, and REST API data (brake wear, weather, strategy).

### Concrete Deliverables
- `tools/generate-lmu-offsets.py` — Recursively walks ctypes.Structure._fields_, handles _pack_=4, exports TypeScript constants
- `tools/dump-lmu-memory.py` — Python script that mmap's LMU_Data, exports .bin + JSON sidecar
- `packages/sim-core/src/lmu-offsets.ts` — Auto-generated offset constants for all LMU structs
- `packages/sim-core/src/lmu-parser.ts` — Pure TypeScript struct parser (no koffi, just Buffer.readXxxLE)
- `packages/sim-core/src/__tests__/lmu-parser.test.ts` — Parser tests with synthetic + real fixtures
- `packages/sim-core/src/__tests__/lmu-offsets.test.ts` — Offset correctness tests
- `apps/desktop/src/main/sim/adapters/lmu-adapter-v2.ts` — New real adapter with koffi + parser + REST
- `apps/desktop/src/main/sim/lmu-rest-client.ts` — REST API poller (RepairAndRefuel, weather, strategy/usage)
- `test-data/lmu-fixture.bin` + `test-data/lmu-fixture.json` — Real LMU dump + expected values

### Definition of Done
- [ ] `pnpm test` passes (all existing 248 tests + 25+ new LMU tests)
- [ ] `pnpm typecheck` passes
- [ ] lmu-adapter-v2.ts can parse a real LMU_Data buffer dump and produce correct Record<string, unknown>
- [ ] REST client polls 3 endpoints with correct JSON parsing and error handling
- [ ] All vehicle scoring parsed (driver names, positions, gaps, pit state, DRS state)

### Must Have
- Buffer size = ctypes.sizeof(LMUObjectOut) from Python generator (~324,820 bytes)
- All 4 sub-structs parsed: generic, paths, scoring (session + vehicles), telemetry (player + wheels)
- classPosition computed by grouping mVehicleClass and re-ranking within class
- mDriverName read as c_char (UTF-8), NOT UTF-16LE
- REST: /rest/garage/UIScreen/RepairAndRefuel → brake wear into tyres
- REST: /rest/sessions/weather → weather data integration
- REST: /rest/strategy/usage → strategy data integration
- Synthetic buffer test constructs ArrayBuffer with known values + asserts correct parsing
- Real fixture test reads .bin file + compares against JSON sidecar
- Graceful fallback when OpenFileMappingW fails (return null, don't crash)
- Performance test: full parse < 5ms per tick at 325KB

### Must NOT Have (Guardrails)
- NO cambiar normalizer.ts (extractLMU se queda como está)
- NO tocar iracing-adapter.ts ni ac-adapter.ts
- NO tocar lmu-mock.ts (mock es para demo, estructura diferente)
- NO tocar overlay components (Standings, Relative, Delta Bar) ni IPC handlers
- NO escribir a REST API (solo lectura)
- NO event-driven parsing (stick with polling a 16Hz)
- NO cambiar createAdapter() hasta que lmu-adapter-v2.ts esté listo para reemplazar

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: ✅ Vitest with 248 existing tests
- **Automated tests**: TDD (RED → GREEN → REFACTOR per task)
- **Framework**: Vitest + bun test

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.omo/evidence/sprint5b/task-{N}-{scenario-slug}.{ext}`.

- **Parser tests**: Bun test with synthetic ArrayBuffer (construct known bytes, assert parsed values)
- **Fixture tests**: Read `test-data/lmu-fixture.bin`, parse, compare against `lmu-fixture.json`
- **REST tests**: Node.js `http.createServer` on localhost for mocked API responses
- **Performance test**: `performance.now()` before/after parse, assert < 5ms

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — tools + fixtures):
├── T1: tools/generate-lmu-offsets.py (Python ctypes offset generator)
├── T2: tools/dump-lmu-memory.py (Python MMAP dumper → test-data/lmu-fixture.bin)
├── T3: packages/sim-core/src/lmu-offsets.ts (generated constants)
└── T4: Synthetic buffer constructor utility (build known LMU buffer in TS)

Wave 2 (Parser core — struct-by-struct TDD):
├── T5: LMUGeneric + LMUPathData parser (header, version, paths)
├── T6: LMUScoringInfo parser (session: track, weather, phase, timers)
├── T7: LMUVehicleScoring parser (all vehicles: driverName, position, gaps, laps, pitState, DRS)
├── T8: classPosition computation (group by mVehicleClass → re-rank)
├── T9: LMUVehicleTelemetry parser (player: engine, inputs, fuel, gears)
└── T10: LMUWheel parser (4 wheels: brakeTemp, pressure, wear, compoundType)

Wave 3 (Adapter wiring + REST API):
├── T11: High-level LMUObjectOut parser (orchestrates all sub-parsers)
├── T12: lmu-adapter-v2.ts (koffi + parser integration, lifecycle)
├── T13: lmu-rest-client.ts (HTTP polling for 3 endpoints)
└── T14: REST data integration into tyres/weather

Wave 4 (Adapter finalization + Integration):
├── T15: Update createAdapter() factory (rename v2→primary, archive v1)
├── T16: Integration test: synthetic buffer → parser → compare expected output
├── T17: Integration test: real fixture (.bin → .json comparison, skip if missing)
├── T18: Edge case tests (15+ cases: empty vehicles, gamePhase=0, pitState extremes, encoding)
└── T19: Performance benchmark (325KB parse < 5ms)

Wave FINAL:
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T3 → T4 → T5-T10 → T11+T13 → T12+T14 → T15 → T16-T19 → F1-F4
```

### Dependency Matrix
- **T1-T3**: Wave 1 — independent (can run parallel)
- **T3→T4**: offsets needed for synthetic buffer
- **T5-T10**: Wave 2 — each independent of each other, all need T3+T4 (max parallel = 6)
- **T11→T12**: Top-level parser needed for adapter
- **T13→T14**: REST client needed before data integration
- **T12+T14→T15**: Adapter + REST integration needed before factory update
- **T12→T16, T18, T19**: Integration tests need adapter
- **T2+T12→T17**: Real fixture test needs dump tool + adapter
- **F1-F4**: All T1-T19 done

### Agent Dispatch Summary
- **Wave 1**: 4 tasks — T1→`deep`, T2→`quick`, T3→`quick`, T4→`deep`
- **Wave 2**: 6 tasks — T5-T10→all `deep` (struct translation is hard)
- **Wave 3**: 4 tasks — T11→`deep`, T12→`deep`, T13→`unspecified-high`, T14→`unspecified-high`
- **Wave 4**: 5 tasks — T15→`quick`, T16→`deep`, T17→`deep`, T18→`unspecified-high`, T19→`quick`
- **Final**: 4 reviewers

---

## TODOs

- [ ] 1. **Python offset generator** — `tools/generate-lmu-offsets.py`

  **What to do**:
  - Read `Vantare-Ingeniero/shared-telemetry/shared_telemetry/pyLMUSharedMemory/lmu_data.py`
  - Import ctypes, recursively walk each struct's `_fields_` respecting `_pack_ = 4`
  - For each struct: compute cumulative offset with packed alignment rules
    - With `_pack_=4`: alignment = min(4, natural_alignment(field_type))
    - doubles → align to 4 (not 8)
    - uint8/bool/char → align to 1
    - int32/float → align to 4
    - Arrays → align same as element type
    - Nested structs → align to struct's max field alignment (with pack)
  - Output TypeScript file to `packages/sim-core/src/lmu-offsets.ts` with:
    - `export const LMU_OBJECT_OUT_SIZE = <number>;`
    - Nested offset constants per sub-struct, e.g.:
      ```typescript
      export const LMU = {
        OBJECT_OUT: { SIZE: 324820 },
        GENERIC: { OFFSET: 0, SIZE: ... },
        PATHS: { OFFSET: ..., SIZE: ... },
        SCORING: { OFFSET: ..., SIZE: ...,
          SCORING_INFO: { OFFSET: 0, ... },
          VEH_SCORING_INFO: { OFFSET: ..., STRIDE: 296, MAX: 104 },
          SCORING_STREAM: { OFFSET: ..., SIZE: 65536 },
        },
        TELEMETRY: { OFFSET: ..., SIZE: ...,
          ACTIVE_VEHICLES: { OFFSET: ... },
          PLAYER_VEHICLE_IDX: { OFFSET: ... },
          PLAYER_HAS_VEHICLE: { OFFSET: ... },
          TELEM_INFO: { OFFSET: ..., STRIDE: 480, MAX: 104 },
        },
      } as const;
      ```
    - For LMUVehicleTelemetry: per-field offsets relative to start of each slot
    - For LMUVehicleScoring: per-field offsets relative to start of each slot
    - For LMUWheel: per-field offsets relative to start of each wheel slot
    - For LMUScoringInfo: per-field offsets
    - For LMUVect3: x, y, z offsets
  - Add assertion comments for critical fields:
    - `// assert: sizeof(driverName[32]) == 32`
    - `// assert: place @ offset X (expected Y bytes from field before)`
  - Run with: `python tools/generate-lmu-offsets.py` on Windows
  - Verify output file has no TypeScript errors

  **Must NOT do**:
  - NO generate a full TypeScript type system — only offset constants
  - NO modify lmu_data.py

  **Recommended Agent Profile**:
  - Category: `deep` — struct translation from Python ctypes to TS offsets requires careful alignment math
  - Skills: `python`, `typescript`

  **Parallelization**: Can run in parallel with T2-T5
  **Blocks**: T3, T5 (needed for all parser tasks)

  **Acceptance Criteria**:
  - [ ] Script runs on Windows without errors
  - [ ] Output file has 0 TypeScript errors
  - [ ] Buffer size matches expected ~324,820 bytes
  - [ ] pack=4 alignment verified: double after ubyte → offset at +4 (not +8)

  **QA Scenarios**:
  ```
  Scenario: Offset generator produces valid TypeScript
    Tool: Bash
    Preconditions: Python 3.12 available on Windows, lmu_data.py exists
    Steps:
      1. python tools/generate-lmu-offsets.py --output packages/sim-core/src/lmu-offsets.ts
      2. bunx tsc --noEmit packages/sim-core/src/lmu-offsets.ts
    Expected Result: Script exits 0, lmu-offsets.ts typechecks
    Evidence: .omo/evidence/sprint5b/task1-generate-run.log

  Scenario: Buffer size is plausible
    Tool: Bash
    Steps: python -c "exec(open('tools/generate-lmu-offsets.py').read().split('output')[0].split('def main')[0]); assert 300000 < ctypes.sizeof(LMUObjectOut) < 350000, 'unexpected size'"
    Expected Result: Size is between 300KB and 350KB
    Evidence: .omo/evidence/sprint5b/task1-size-check.log
  ```
  **Commit**: YES
  - Message: `feat(tools): add LMU offset generator and dump script`
  - Files: `tools/generate-lmu-offsets.py`

- [ ] 2. **Python memory dump tool** — `tools/dump-lmu-memory.py`

  **What to do**:
  - Create `tools/dump-lmu-memory.py` that uses `mmap.mmap(-1, ctypes.sizeof(LMUObjectOut), "LMU_Data")`
  - If mapping fails (LMU not running), print error and exit 1
  - Read the buffer, write to `test-data/lmu-fixture.bin`
  - Parse using the Python ctypes struct hierarchy
  - Output sidecar `test-data/lmu-fixture.json` with known-good parsed values:
    ```json
    {
      "session": { "trackName": "...", "sessionType": 5, "gamePhase": 5, ... },
      "playerScoring": { "driverName": "...", "place": 1, "totalLaps": 5, ... },
      "playerTelemetry": { "engineRPM": 6500.0, "gear": 4, "fuel": 45.2, ... },
      "numVehicles": 30
    }
    ```
  - Note in a comment: this only works on Windows with LMU running

  **Must NOT do**:
  - NO attempt to run in CI (explicitly documented as Windows+LMU only)

  **Recommended Agent Profile**:
  - Category: `quick` — straightforward Python mmap script
  - Skills: `python`

  **Parallelization**: Can run in parallel with T1, T3-T5
  **Blocks**: T4 (provides the fixture), T17 (integration test with real fixture)

  **Acceptance Criteria**:
  - [ ] Script runs on Windows with LMU running
  - [ ] Outputs .bin and .json files
  - [ ] JSON has expected top-level keys
  - [ ] Errors gracefully when LMU not running

  **QA Scenarios**:
  ```
  Scenario: Script fails gracefully without LMU
    Tool: Bash
    Steps: python tools/dump-lmu-memory.py 2>&1
    Expected Result: Error message about LMU not running, exit code 1
    Evidence: .omo/evidence/sprint5b/task2-no-lmu.log

  Scenario: Script succeeds with LMU (manual, LMU required)
    Tool: Bash
    Preconditions: LeMansUltimate.exe running on track
    Steps:
      1. python tools/dump-lmu-memory.py --output-dir test-data
      2. ls test-data/lmu-fixture.bin test-data/lmu-fixture.json
    Expected Result: Both files created, non-empty
    Evidence: .omo/evidence/sprint5b/task2-dump-success.log
  ```
  **Commit**: YES (with T1)
  - Files: `tools/dump-lmu-memory.py`

- [ ] 3. **Generated offset constants** — `packages/sim-core/src/lmu-offsets.ts`

  **What to do**:
  - Run `python tools/generate-lmu-offsets.py --output packages/sim-core/src/lmu-offsets.ts`
  - Verify the generated file compiles with `tsc --noEmit`
  - Verify all top-level struct sections are present:
    - `LMU.GENERIC`, `LMU.PATHS`, `LMU.SCORING`, `LMU.TELEMETRY`
    - `LMU.SCORING.SCORING_INFO` with all session fields
    - `LMU.SCORING.VEH_SCORING_INFO` with STRIDE and per-field offsets
    - `LMU.TELEMETRY.TELEM_INFO` with STRIDE and per-field offsets
    - `LMU.VEHICLE_TELEMETRY` with all engine/input/wheel fields
    - `LMU.WHEEL` with all 4 wheel data fields

  **Must NOT do**:
  - NO manual edits to the generated file — if offsets are wrong, fix the generator

  **Recommended Agent Profile**:
  - Category: `quick` — just run the generator and verify
  - Skills: `typescript`

  **Parallelization**: Depends on T1 (needs generator)
  **Blocks**: T5-T11 (all parser tasks)

  **Acceptance Criteria**:
  - [ ] `tsc --noEmit packages/sim-core/src/lmu-offsets.ts` passes
  - [ ] All expected sections present
  - [ ] File is auto-generated (header comment: `// Auto-generated by tools/generate-lmu-offsets.py`)

  **QA Scenarios**:
  ```
  Scenario: Generated file compiles
    Tool: Bash
    Steps:
      1. python tools/generate-lmu-offsets.py --output packages/sim-core/src/lmu-offsets.ts
      2. bunx tsc --noEmit packages/sim-core/src/lmu-offsets.ts
    Expected Result: Both exit 0
    Evidence: .omo/evidence/sprint5b/task3-compile.log

  Scenario: Key constants are present
    Tool: Grep
    Steps: grep "LMU_OBJECT_OUT_SIZE\|GENERIC\|TELEM_INFO\|STRIDE" packages/sim-core/src/lmu-offsets.ts
    Expected Result: All key sections found
    Evidence: .omo/evidence/sprint5b/task3-constants.log
  ```
  **Commit**: YES (with T1, T2)
  - Files: `packages/sim-core/src/lmu-offsets.ts`

- [ ] 4. **Synthetic buffer constructor** — `packages/sim-core/src/lmu-parser.ts` + test infrastructure

  **What to do**:
  - Create a utility to construct a synthetic LMU buffer as `ArrayBuffer` for testing:
    ```typescript
    function buildSyntheticLMUBuffer(overrides?: Partial<LMUBufferConfig>): Buffer
    ```
  - The utility fills the buffer with known test values at the correct offsets (from lmu-offsets.ts)
  - All struct fields get default test values (e.g., mEngineRPM = 6500, mGear = 4, mFuel = 45.2)
  - Utility exports `LMU_SYNTHETIC_FIXTURE` with the buffer + expected parsed values for assertions
  - Create `packages/sim-core/src/lmu-parser.ts` with the `struct` namespace:
    ```typescript
    export function parseLMUObjectOut(buf: Buffer): LMUObjectOutData | null
    ```
  - For now, just the function signature and helper types. Actual parsing in T6-T11.

  **Must NOT do**:
  - NO actual struct parsing in this task (just buffer construction utilities)
  - NO koffi imports (pure Buffer operations)

  **Recommended Agent Profile**:
  - Category: `deep` — careful offset math, need to get alignment right
  - Skills: `typescript`

  **Parallelization**: Depends on T3 (needs offsets)
  **Blocks**: T6-T11 (all parser tasks need the synthetic buffer for TDD)

  **Acceptance Criteria**:
  - [ ] Synthetic buffer creates a valid 324,820-byte Buffer
  - [ ] Values at known offsets can be read back using readXxxLE
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  ```
  Scenario: Synthetic buffer size matches expected
    Tool: Bash (bun test)
    Steps: Write test that creates buffer, asserts .length === LMU_OBJECT_OUT_SIZE
    Expected Result: Buffer has correct size
    Evidence: .omo/evidence/sprint5b/task4-buffer-size.log

  Scenario: Known value can be read back
    Tool: Bash (bun test)
    Steps: Write test that reads rpm @ TELEM_INFO[0].ENGINE_RPM offset, asserts 6500.0
    Expected Result: Value matches what was written
    Evidence: .omo/evidence/sprint5b/task4-known-value.log
  ```
  **Commit**: YES
  - Message: `feat(sim-core): add LMU synthetic buffer constructor and parser skeleton`
  - Files: `packages/sim-core/src/lmu-parser.ts`

- [ ] 5. **LMUGeneric + LMUPathData parser** — TDD

  **What to do**:
  - Implement parser for LMUGeneric (events, gameVersion, FFBTorque, appInfo):
    - `mVersion` @ offset 0 (int32)
    - `FFBTorque` @ offset after events struct (float)
    - `appInfo` → `mWidth`, `mHeight`, `mRefreshRate`, `mWindowed` (uint32 each)
  - Implement parser for LMUPathData (5 path strings, 260 chars each):
    - Each path is `c_char[260]` — read as UTF-8, null-terminated
  - RED: Write test using synthetic buffer with known event flags + paths
  - GREEN: Implement until test passes
  - REFACTOR: Clean up offset expressions

  **Must NOT do**:
  - NO read past buffer bounds (guard with buf.length checks)
  - NO assume strings are valid UTF-8 (fallback to '')

  **Recommended Agent Profile**:
  - Category: `deep` — careful struct translation
  - Skills: `typescript`

  **Parallelization**: Independent of T6-T11 (each sub-struct is its own task)
  **Blocks**: Nothing directly (generic/paths are metadata, not used by adapter)

  **Acceptance Criteria**:
  - [ ] RED test written first with synthetic buffer
  - [ ] GREEN: parser extracts known values from synthetic buffer
  - [ ] Invalid buffer (too small, wrong version) returns null

  **QA Scenarios**:
  ```
  Scenario: Parses game version correctly
    Tool: Bash (bun test)
    Steps:
      1. Construct synthetic buffer with mVersion = 42 at correct offset
      2. Run parser, assert generic.gameVersion === 42
    Expected Result: Version extracted correctly
    Evidence: .omo/evidence/sprint5b/task5-version.log

  Scenario: Null on too-small buffer
    Tool: Bash (bun test)
    Steps: Pass Buffer.alloc(10) to parser, assert returns null
    Expected Result: null returned safely
    Evidence: .omo/evidence/sprint5b/task5-null.log
  ```
  **Commit**: YES
  - Message: `feat(sim-core): add LMU generic and path data parser`
  - Files: `packages/sim-core/src/lmu-parser.ts`, `packages/sim-core/src/__tests__/lmu-parser.test.ts`

- [ ] 6. **LMUScoringInfo parser (session)** — TDD

  **What to do**:
  - Implement parser for LMUScoringInfo (scoring.scoringInfo):
    - `mTrackName` — c_char[64], UTF-8 null-terminated
    - `mSession` — int32 (0=testday, 1-4=practice, 5-8=qual, 9=warmup, 10-13=race)
    - `mCurrentET` — double (elapsed time in seconds)
    - `mEndET` — double
    - `mMaxLaps` — int32
    - `mLapDist` — double (track length in meters)
    - `mNumVehicles` — int32
    - `mGamePhase` — uint8 (0-9, phase enum)
    - `mYellowFlagState` — char (signed!)
    - `mSectorFlag` — uint8[3]
    - `mPlayerName` — c_char[32]
    - `mDarkCloud` — double (0.0-1.0)
    - `mRaining` — double (0.0-1.0)
    - `mAmbientTemp` — double (Celsius)
    - `mTrackTemp` — double (Celsius)
    - `mWind` — LMUVect3 (3 doubles: x, y, z)
    - `mMinPathWetness` — double
    - `mMaxPathWetness` — double
    - `mAvgPathWetness` — double
    - `mSessionTimeRemaining` — float
    - `mTimeOfDay` — float
    - `mTrackGripLevel` — uint8 (0-4)
    - `mCloudCoverage` — uint8 (0-10)
    - `mTrackLimitsStepsPerPenalty` — uint8
    - `mTrackLimitsStepsPerPoint` — uint8
  - Output format: flat Record with field names matching what extractLMU() expects:
    - `sessionTime` → mCurrentET
    - `sessionTimeRemain` → mSessionTimeRemaining
    - `sessionType` → mapped from mSession enum to string
    - `sessionState` → mapped from mGamePhase enum
    - `trackName` → mTrackName
    - `trackLength` → mLapDist
    - `ambientTemp` → mAmbientTemp
    - `trackTemp` → mTrackTemp
    - `humidity` → from mRaining? No, mDarkCloud or compute
    - `rainIntensity` → mRaining
    - `windSpeed` → magnitude of mWind (LMUVect3)
    - `windDirection` → mWind.z or compute angle
    - `totalLaps` → mMaxLaps

  **Must NOT do**:
  - NO parse vehScoringInfo here (that's T8)
  - NO parse telemInfo here (that's T10)

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: `typescript`

  **Parallelization**: Independent of T5, T7-T11
  **Blocks**: T12 (adapter needs session data)

  **Acceptance Criteria**:
  - [ ] TDD: RED → GREEN → REFACTOR
  - [ ] All 25+ fields parsed correctly from synthetic buffer
  - [ ] Null-safe: partial buffer returns partial data (not crash)
  - [ ] GamePhase mapped to correct string state
  - [ ] Session type mapped to correct string

  **QA Scenarios**:
  ```
  Scenario: Parses track name and session fields
    Tool: Bash (bun test)
    Steps: Build synthetic buffer with known mTrackName="Spa", mSession=10, mGamePhase=5
    Expected Result: trackName="Spa", sessionType="race", sessionState="green"
    Evidence: .omo/evidence/sprint5b/task6-session.log

  Scenario: Parses weather data
    Tool: Bash (bun test)
    Steps: Set mAmbientTemp=25.5, mTrackTemp=38.0, mRaining=0.3, mWind=(3,0,0)
    Expected Result: ambientTemp=25.5, trackTemp=38.0, rainIntensity=0.3, windSpeed=3.0
    Evidence: .omo/evidence/sprint5b/task6-weather.log
  ```
  **Commit**: YES
  - Message: `feat(sim-core): add LMU scoring info parser (session + weather)`
  - Files: `packages/sim-core/src/lmu-parser.ts`, `packages/sim-core/src/__tests__/lmu-parser.test.ts`

- [ ] 7. **LMUVehicleScoring parser (all vehicles)** — TDD

  **What to do**:
  - Implement parser for `scoring.vehScoringInfo[0..numVehicles-1]`:
    - Each slot = VEH_SCORING_STRIDE bytes
    - `mID` — int32 (slot ID, -1 = invalid)
    - `mDriverName` — c_char[32], UTF-8 null-terminated
    - `mVehicleName` — c_char[64], UTF-8
    - `mTotalLaps` — short
    - `mSector` — byte (0=sector3, 1=sector1, 2=sector2 — LMU weirdness)
    - `mFinishStatus` — byte (0=none, 1=finished, 2=dnf, 3=dq)
    - `mLapDist` — double
    - `mBestLapTime` — double (seconds)
    - `mLastLapTime` — double (seconds)
    - `mCurSector1` — double (current sector 1 time)
    - `mCurSector2` — double (current sector 2, includes S1)
    - `mNumPitstops` — short
    - `mNumPenalties` — short
    - `mIsPlayer` — bool
    - `mControl` — byte (-1=nobody, 0=player, 1=AI, 2=remote, 3=replay)
    - `mInPits` — bool
    - `mPlace` — ubyte (1-based position)
    - `mVehicleClass` — c_char[32]
    - `mTimeBehindNext` — double
    - `mLapsBehindNext` — int
    - `mTimeBehindLeader` — double
    - `mLapsBehindLeader` — int
    - `mPitState` — ubyte (0=none, 1=request, 2=entering, 3=stopped, 4=exiting)
    - `mQualification` — int (1-based, -1=invalid)
    - `mEstimatedLapTime` — double
    - `mPitGroup` — c_char[24]
    - `mFlag` — ubyte (0=green, 6=blue)
    - `mFuelFraction` — ubyte (0x00-0xFF percentage)
    - `mDRSState` — bool
    - `mSteamID` — ulonglong
  - Sentinel check: skip vehicles where `mID < 0 || mDriverName === ''`
  - Output: array of Record<string, unknown> with fields normalized

  **Must NOT do**:
  - NO parse classPosition here (that's T9)
  - NO parse telemInfo here (that's T10)
  - NO attempt to read all 104 entries — read 0..numVehicles-1 only

  **Recommended Agent Profile**:
  - Category: `deep` — largest struct, many fields, careful offset math
  - Skills: `typescript`

  **Parallelization**: Independent of T5, T6, T9-T11
  **Blocks**: T9 (classPosition needs vehicle data), T12 (adapter needs vehicles)

  **Acceptance Criteria**:
  - [ ] TDD with synthetic buffer containing 5 vehicles
  - [ ] Parses all 5 vehicles with correct driverName, position, laps, gaps
  - [ ] Skips invalid entries (mID < 0)
  - [ ] Returns empty array when numVehicles = 0
  - [ ] mSector correctly mapped (0=sector3, 1=sector1, 2=sector2)
  - [ ] mPitState mapped correctly
  - [ ] Lap times converted from seconds to milliseconds

  **QA Scenarios**:
  ```
  Scenario: Parses multiple vehicles with correct positions
    Tool: Bash (bun test)
    Steps:
      1. Synthetic buffer with 3 vehicles: places 1, 2, 3
      2. Parse, assert vehicles[0].mPlace === 1, vehicles[1].mPlace === 2
    Expected Result: Positions match input
    Evidence: .omo/evidence/sprint5b/task7-positions.log

  Scenario: Skips invalid vehicle slots
    Tool: Bash (bun test)
    Steps: Vehicle 0 valid, vehicle 1 has mID=-1, vehicle 2 valid. numVehicles=3
    Expected Result: 2 vehicles output (0 and 2, skip 1)
    Evidence: .omo/evidence/sprint5b/task7-skip.log

  Scenario: Pit state mapped correctly
    Tool: Bash (bun test)
    Steps: Vehicle 0 mPitState=0, Vehicle 1 mPitState=3
    Expected Result: v0.isPitting=false, v1.isPitting=true
    Evidence: .omo/evidence/sprint5b/task7-pitstate.log
  ```
  **Commit**: YES
  - Message: `feat(sim-core): add LMU vehicle scoring parser`
  - Files: `packages/sim-core/src/lmu-parser.ts`, `packages/sim-core/src/__tests__/lmu-parser.test.ts`

- [ ] 8. **classPosition computation** — TDD

  **What to do**:
  - After vehicle scoring is parsed, compute classPosition for each vehicle:
    1. Group all vehicles by `mVehicleClass` value
    2. Within each group, sort by `mPlace`
    3. Assign classPosition = 1-based rank within the group
  - Handle edge cases:
    - Single class: classPosition === position
    - All vehicles in same class: same as position
    - Vehicle with empty mVehicleClass: treat as single default class
  - Output: add `classPosition` field to each vehicle's parsed record

  **Must NOT do**:
  - NO re-parse the vehicle array
  - NO modify the original scoring data

  **Recommended Agent Profile**:
  - Category: `deep` — algorithmic
  - Skills: `typescript`

  **Parallelization**: Depends on T7 (needs parsed vehicles)
  **Blocks**: T12 (adapter needs classPosition)

  **Acceptance Criteria**:
  - [ ] TDD: two classes (Hypercar + GT3) with 5 cars each, class positions correctly ranked
  - [ ] Single class returns same as position
  - [ ] Empty vehicle array returns empty

  **QA Scenarios**:
  ```
  Scenario: Two classes ranked correctly
    Tool: Bash (bun test)
    Steps:
      1. 6 vehicles: 3 Hypercar (positions 1,3,5) + 3 GT3 (positions 2,4,6)
      2. Compute classPosition
    Expected Result: Hypercars get 1,2,3. GT3 get 1,2,3.
    Evidence: .omo/evidence/sprint5b/task8-classpos.log

  Scenario: Single class equals position
    Tool: Bash (bun test)
    Steps: 5 vehicles all Hypercar, positions 1-5
    Expected Result: classPosition === position for all
    Evidence: .omo/evidence/sprint5b/task8-singleclass.log
  ```
  **Commit**: YES (with T7)
  - Files: `packages/sim-core/src/lmu-parser.ts`, `packages/sim-core/src/__tests__/lmu-parser.test.ts`

- [ ] 9. **LMUVehicleTelemetry parser (player)** — TDD

  **What to do**:
  - Implement parser for `telemetry.telemInfo[playerIdx]`:
    - `mID` — int32
    - `mDeltaTime` — double
    - `mElapsedTime` — double
    - `mLapNumber` — int
    - `mVehicleName` — c_char[64]
    - `mTrackName` — c_char[64]
    - `mLocalVel` — LMUVect3 (3 doubles): compute `speed = sqrt(x² + y² + z²)`
    - `mLocalAccel` — LMUVect3
    - `mGear` — int (-1=R, 0=N, 1+)
    - `mEngineRPM` — double
    - `mEngineWaterTemp` — double (°C)
    - `mEngineOilTemp` — double (°C)
    - `mFilteredThrottle` — double (0.0-1.0)
    - `mFilteredBrake` — double (0.0-1.0)
    - `mFilteredSteering` — double (-1.0 to 1.0)
    - `mFilteredClutch` — double (0.0-1.0)
    - `mFuel` — double (liters)
    - `mEngineMaxRPM` — double
    - `mEngineTorque` — double (Nm)
    - `mFuelCapacity` — double (liters)
    - `mDeltaBest` — double (delta to best lap, seconds)
    - `mCurrentSector` — int (sector with pit sign bit)
    - `mBatteryChargeFraction` — double (0.0-1.0)
    - `mStateOfCharge` — float (%)
    - `mRegen` — float (kW)
    - `mTimeGapPlaceAhead` — float (seconds)
    - `mTimeGapPlaceBehind` — float (seconds)
    - `mVehicleModel` — c_char[30]
    - `mRearFlapActivated` — ubyte (DRS)
    - `mRearFlapLegalStatus` — ubyte (0=disallowed, 1=detected, 2=allowed)
  - Output: flat Record with field names matching extractLMU() expectations

  **Must NOT do**:
  - NO parse mWheels here (that's T10)
  - NO parse full 104 entries — only the player's entry

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: `typescript`

  **Parallelization**: Independent of T5-T8, T10-T11
  **Blocks**: T12 (adapter needs player telemetry)

  **Acceptance Criteria**:
  - [ ] TDD: synthetic buffer with known telemetry values
  - [ ] speed computed as sqrt(x²+y²+z²) from mLocalVel
  - [ ] All engine, input, fuel fields parsed correctly
  - [ ] mGear correctly mapped (-1=reverse, 0=neutral)
  - [ ] mDeltaBest converted appropriately

  **QA Scenarios**:
  ```
  Scenario: Engine RPM and gear correctly parsed
    Tool: Bash (bun test)
    Steps: Set mEngineRPM=7200.0, mGear=4 in synthetic buffer
    Expected Result: rpm=7200, gear=4
    Evidence: .omo/evidence/sprint5b/task9-engine.log

  Scenario: Speed from mLocalVel
    Tool: Bash (bun test)
    Steps: Set mLocalVel=(10, 0, 0) → speed=10 m/s
    Expected Result: speed=10
    Evidence: .omo/evidence/sprint5b/task9-speed.log

  Scenario: Throttle/brake/clutch ranges
    Tool: Bash (bun test)
    Steps: Set mFilteredThrottle=0.85, mFilteredBrake=0.0
    Expected Result: throttle=0.85, brake=0.0
    Evidence: .omo/evidence/sprint5b/task9-inputs.log
  ```
  **Commit**: YES
  - Message: `feat(sim-core): add LMU vehicle telemetry parser (player)`
  - Files: `packages/sim-core/src/lmu-parser.ts`, `packages/sim-core/src/__tests__/lmu-parser.test.ts`

- [ ] 10. **LMUWheel parser (4 wheels)** — TDD

  **What to do**:
  - Implement parser for `telemInfo[playerIdx].mWheels[0..3]`:
    - Each wheel slot = WHEEL_STRIDE bytes
    - `mBrakeTemp` — double (°C)
    - `mBrakePressure` — double (0.0-1.0, eventually kPa)
    - `mPressure` — double (kPa, tire pressure)
    - `mTemperature` — double[3] (Kelvin, left/center/right)
    - `mWear` — double (0.0-1.0)
    - `mCamber` — double (radians)
    - `mToe` — double (radians)
    - `mTireLoad` — double (Newtons)
    - `mRotation` — double (rad/s)
    - `mCompoundIndex` — ubyte
    - `mCompoundType` — ubyte (0=soft, 1=medium, 2=hard, 3=wet)
    - `mSurfaceType` — ubyte (0=dry, 1=wet, 2=grass, etc.)
    - `mFlat` — bool
    - `mDetached` — bool
    - `mOptimalTemp` — float (°C)
  - Output: per-wheel Record with normalized names
  - Note: brake wear comes from REST API (T13), NOT shared memory

  **Must NOT do**:
  - NO parse full 104 entries — only the player's 4 wheels
  - NO set brake wear from shared memory (brake wear is REST API only)

  **Recommended Agent Profile**:
  - Category: `deep` — complex nested array, temperature triplets
  - Skills: `typescript`

  **Parallelization**: Independent of T5-T9, T11
  **Blocks**: T12 (adapter needs wheel data)

  **Acceptance Criteria**:
  - [ ] TDD: 4 wheels parsed with correct temperatures, pressures, wear
  - [ ] mTemperature[3] → temp (convert Kelvin→Celsius: subtract 273.15)
  - [ ] mPressure → pressure (kPa → keep as-is)
  - [ ] mWear → wear (0.0-1.0 → keep as fraction)

  **QA Scenarios**:
  ```
  Scenario: Wheel temperatures converted to Celsius
    Tool: Bash (bun test)
    Steps: Set mTemperature[0]=300.15, mTemperature[1]=310.15, mTemperature[2]=305.15
    Expected Result: temp=~27 (average of (27+37+32)/3 ≈ 32°C)
    Evidence: .omo/evidence/sprint5b/task10-temps.log

  Scenario: All 4 wheels parsed with correct corner index
    Tool: Bash (bun test)
    Steps: Set wheel[0].mPressure=24.0, wheel[1].mPressure=24.5
    Expected Result: fl.pressure=24.0, fr.pressure=24.5
    Evidence: .omo/evidence/sprint5b/task10-wheels.log
  ```
  **Commit**: YES (with T9)
  - Files: `packages/sim-core/src/lmu-parser.ts`, `packages/sim-core/src/__tests__/lmu-parser.test.ts`

- [ ] 11. **High-level LMUObjectOut parser** — `parseLMUObjectOut()`

  **What to do**:
  - Create the top-level `parseLMUObjectOut(buf: Buffer): LMUParsedData | null` function
  - Combines all sub-parsers (T5-T10) into one orchestrated call:
    1. Validate buffer size >= LMU_OBJECT_OUT_SIZE
    2. Parse generic + paths (T5)
    3. Parse scoringInfo (T6) → session data
    4. Parse vehScoringInfo (T7) with numVehicles from scoringInfo
    5. Compute classPosition (T8)
    6. Parse telemInfo[playerIdx] (T9) with playerIdx from telemetry header
    7. Parse mWheels[0..3] (T10) from player's telemetry
  - Output LMUParsedData:
    ```typescript
    interface LMUParsedData {
      session: Record<string, unknown>;
      playerTelemetry: Record<string, unknown> | null;
      vehicles: Record<string, unknown>[];
      wheels: Record<string, unknown>[] | null;
      generic: Record<string, unknown>;
      paths: Record<string, unknown>;
    }
    ```
  - If playerHasVehicle === false, playerTelemetry = null, wheels = null

  **Must NOT do**:
  - NO include koffi or Windows API calls here (parser is pure Buffer ops)
  - NO log or side effects

  **Recommended Agent Profile**:
  - Category: `deep` — orchestration
  - Skills: `typescript`

  **Parallelization**: Depends on T5-T10 (all sub-parsers)
  **Blocks**: T12 (adapter needs parseLMUObjectOut)

  **Acceptance Criteria**:
  - [ ] Combines all sub-parser results into one flat structure
  - [ ] Returns null on buffer too small
  - [ ] Returns null on invalid header
  - [ ] Returns null when buffer is truncated mid-struct (partial data at end)

  **QA Scenarios**:
  ```
  Scenario: Full parse from synthetic buffer
    Tool: Bash (bun test)
    Steps: Build full synthetic buffer with known values, run parseLMUObjectOut
    Expected Result: All sections populated with correct values
    Evidence: .omo/evidence/sprint5b/task11-full-parse.log

  Scenario: Null on truncated buffer
    Tool: Bash (bun test)
    Steps: Allocate Buffer.alloc(100), run parseLMUObjectOut
    Expected Result: Returns null
    Evidence: .omo/evidence/sprint5b/task11-truncated.log
  ```
  **Commit**: YES
  - Message: `feat(sim-core): add top-level LMUObjectOut parser`
  - Files: `packages/sim-core/src/lmu-parser.ts`

- [ ] 12. **LMU adapter v2** — `apps/desktop/src/main/sim/adapters/lmu-adapter-v2.ts`

  **What to do**:
  - Create new `LMUAdapterV2` class implementing `SimAdapter`, alongside the old skeleton
  - Copy lifecycle from skeleton (connect/disconnect/destroy/onTelemetry)
  - Replace the skeleton's hardcoded offsets with:
    1. koffi `MapViewOfFile` with `LMU_OBJECT_OUT_SIZE` (from lmu-offsets.ts)
    2. Every poll tick: copy buffer → `parseLMUObjectOut()` → map fields to flat Record
    3. Map LMUParsedData fields to what extractLMU() expects in normalizer.ts
  - Output format: flat `Record<string, unknown>` with these keys (matching extractLMU):
    - `speed`, `rpm`, `gear`, `throttle`, `brake`, `clutch`, `steer`
    - `position`, `classPosition`, `lapDistance`
    - `lap` → `{ current, total, lastTime, bestTime, sector, sectorTimes, estimatedLaptime, delta, isPersonalBest, isSessionBest }`
    - `sessionTime`, `sessionTimeRemain`, `sessionType`, `sessionState`, `totalLaps`
    - `trackName`, `trackLength`
    - `driverName`, `carNumber`, `teamName`
    - `fuel`, `fuelMax`, `fuelPressure`, `engineWaterTemp`, `engineOilTemp`, `engineOilPressure`, `maxRpm`
    - `ambientTemp`, `trackTemp`, `humidity`, `rainIntensity`, `windSpeed`, `windDirection`
    - `tyres` → `{ fl, fr, rl, rr }` each with `{ temp, pressure, wear }`
    - `isOnTrack`, `isInPit`, `isPitting`
    - `engineWarnings`
  - Integrate REST client data:
    - brake wear → tyres.wear (from T13 REST data)
    - weather → weather fields
  - Register in `createAdapter()` (T15-ish — update index.ts)
  - **Keep old skeleton importable** — do NOT rename yet

  **Must NOT do**:
  - NO delete `lmu-adapter.ts` skeleton yet (will be renamed in final wave)
  - NO modify normalizer.ts
  - NO modify SimManager
  - NO modify createAdapter() export path until tested

  **Recommended Agent Profile**:
  - Category: `deep` — complex adapter with real shared memory + parser integration
  - Skills: `typescript`

  **Parallelization**: Depends on T11 (needs parser) and T14 (needs REST client)
  **Blocks**: T16-T19 (integration and tests need the adapter)

  **Acceptance Criteria**:
  - [ ] Implements SimAdapter interface
  - [ ] connect() maps LMU_Data via koffi, returns clean error if LMU not running
  - [ ] Poll loop calls parseLMUObjectOut on each tick
  - [ ] Output Record matches what extractLMU() in normalizer.ts expects
  - [ ] destroy() properly unmaps and cleans up
  - [ ] Old skeleton still importable

  **QA Scenarios**:
  ```
  Scenario: Adapter connects with synthetic buffer (mock MapViewOfFile)
    Tool: Bun test with mocked kernel32 functions
    Steps: Mock koffi to return known buffer, call adapter.connect()
    Expected Result: connected === true, telemetry callback fires with correct data
    Evidence: .omo/evidence/sprint5b/task12-connect.log

  Scenario: Adapter disconnects cleanly
    Tool: Bun test
    Steps: Connect, then disconnect
    Expected Result: Buffer unmapped, no pending intervals, no memory leak
    Evidence: .omo/evidence/sprint5b/task12-disconnect.log
  ```
  **Commit**: YES
  - Message: `feat(desktop): add LMU adapter v2 with real shared memory parser`
  - Files: `apps/desktop/src/main/sim/adapters/lmu-adapter-v2.ts`

- [ ] 13. **REST API client** — `apps/desktop/src/main/sim/lmu-rest-client.ts`

  **What to do**:
  - Create `LMURestClient` class that polls 3 endpoints:
    ```typescript
    class LMURestClient {
      constructor(baseUrl?: string); // default http://localhost:6397
      start(): void;                  // starts all polling intervals
      stop(): void;
      getBrakeWear(): number[];       // [FL, FR, RL, RR] 0.0-1.0
      getWeather(): WeatherCache;     // latest weather snapshot
      getStrategyUsage(): StrategyCache;
    }
    ```
  - Polling intervals:
    - `/rest/garage/UIScreen/RepairAndRefuel` — every 3s
      ```typescript
      // Response: { wearables: { brakes: [0.92, 0.88, 0.85, 0.90], ... } }
      // Extract: wearables.brakes[0..3] (FL, FR, RL, RR)
      ```
    - `/rest/sessions/weather` — every 120s
      ```typescript
      // Response: { PRACTICE: { START: { WNV_TEMPERATURE, WNV_HUMIDITY, ... }, ... }, ... }
      // Extract: current session's START node values
      ```
    - `/rest/strategy/usage` — every 3s
      ```typescript
      // Response: { "Driver Name": [{ "ve": 1.0 }, ...], ... }
      // Extract: per-driver VE arrays
      ```
  - Error handling:
    - HTTP timeout: 2s per request
    - On fetch failure: log debug, keep previous cache, do NOT crash
    - On malformed JSON: log warning, keep previous cache
    - Exponential backoff on repeated failures (max 30s)
  - Cache strategy:
    - Each endpoint has its own cache (stale data is better than no data)
    - Caches survive across polling cycles
    - Cache is reset when adapter restarts

  **Must NOT do**:
  - NO write to REST API (read-only)
  - NO block the poll loop (fetch is async, but cache serves last known value)
  - NO queue requests (drop if previous request still pending)

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: `typescript`

  **Parallelization**: Independent of T5-T11 (REST is separate from shared memory)
  **Blocks**: T14 (needs client for testing), T15 (needs client for data integration)

  **Acceptance Criteria**:
  - [ ] Polls 3 endpoints at correct intervals
  - [ ] Parses brake wear JSON correctly
  - [ ] Returns cached value when server is down
  - [ ] Timeout after 2s for unreachable server
  - [ ] Starts/stops cleanly (no leaked intervals)

  **QA Scenarios**:
  ```
  Scenario: Brake wear from REST API
    Tool: Bun test with http.createServer
    Steps:
      1. Start local HTTP server on port 6399 returning brake wear JSON
      2. Create LMURestClient("http://localhost:6399"), start()
      3. Wait 4s, check getBrakeWear()
    Expected Result: Returns [0.92, 0.88, 0.85, 0.90]
    Evidence: .omo/evidence/sprint5b/task13-brakewear.log

  Scenario: Server down doesn't crash
    Tool: Bun test
    Steps: Create client pointing to port 6398 (nothing listening), start()
    Expected Result: No crash, getBrakeWear() returns empty/default array
    Evidence: .omo/evidence/sprint5b/task13-server-down.log
  ```
  **Commit**: YES
  - Message: `feat(desktop): add LMU REST API client (brake wear, weather, strategy)`
  - Files: `apps/desktop/src/main/sim/lmu-rest-client.ts`

- [ ] 14. **REST client data integration into adapter**

  **What to do**:
  - Wire LMURestClient into LMUAdapterV2:
    1. Create LMURestClient instance in adapter constructor
    2. Call `start()` on connect, `stop()` on disconnect
    3. In each poll tick, after parseLMUObjectOut:
       - Merge brake wear from REST into tyres.fl/fr/rl/rr.wear
       - Merge weather from REST on top of shared memory weather
       - Merge strategy stats into vehicle data
  - Priority: shared memory values take precedence for fields that exist in both
    - Exception: brake wear ONLY comes from REST (shared memory doesn't have it)
    - Weather: shared memory is real-time (16Hz), REST is forecast (120s), use shared memory as primary

  **Must NOT do**:
  - NO modify LMURestClient from this task
  - NO block telemetry polling on REST response

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: `typescript`

  **Parallelization**: Depends on T12 (needs adapter) and T13 (needs REST client)
  **Blocks**: Nothing (integration tasks can use REST via adapter)

  **Acceptance Criteria**:
  - [ ] Brake wear from REST appears in tyres.fl/fr/rl/rr.wear
  - [ ] REST weather data available but shared memory takes priority
  - [ ] REST strategy data available in vehicle records
  - [ ] Adapter doesn't crash if REST client hasn't fetched data yet

  **QA Scenarios**:
  ```
  Scenario: Brake wear overrides tyre wear
    Tool: Integration test with mock REST + synthetic buffer
    Steps:
      1. Synthetic buffer has mWear=0.5 for all wheels
      2. REST returns brake wear [0.9, 0.85, 0.8, 0.75]
      3. Adapter outputs tyres with wear=0.9, 0.85, 0.8, 0.75
    Expected Result: Brake wear from REST, not shared memory
    Evidence: .omo/evidence/sprint5b/task14-integration.log

  Scenario: No REST data = shared memory defaults
    Tool: Integration test
    Steps: REST server returns nothing, adapter parses synthetic buffer
    Expected Result: tyre wear = mWear from shared memory (0.5)
    Evidence: .omo/evidence/sprint5b/task14-no-rest.log
  ```
  **Commit**: YES (with T12)
  - Files: `apps/desktop/src/main/sim/adapters/lmu-adapter-v2.ts`

- [ ] 15. **Update createAdapter() factory** — `apps/desktop/src/main/sim/adapters/index.ts`

  **What to do**:
  - After LMUAdapterV2 is fully tested, update `createAdapter()`:
    ```typescript
    case 'lmu': {
      const { LMUAdapterV2 } = require('./lmu-adapter-v2');
      return new LMUAdapterV2();
    }
    ```
  - Rename old `lmu-adapter.ts` to `lmu-adapter-v1-skeleton.ts` as archive
  - Rename `lmu-adapter-v2.ts` → `lmu-adapter.ts` for clean `require('./lmu-adapter')`
  - Verify all imports still work
  - Run full test suite

  **Must NOT do**:
  - NO change other cases (iracing, ac)
  - NO break existing createAdapter logic

  **Recommended Agent Profile**:
  - Category: `quick` — straightforward rename
  - Skills: `typescript`

  **Parallelization**: Depends on T12 (adapter done)
  **Blocks**: Nothing (final wiring step)

  **Acceptance Criteria**:
  - [ ] createAdapter('lmu') returns LMUAdapterV2 instance
  - [ ] Old skeleton renamed, not deleted
  - [ ] Full test suite passes

  **QA Scenarios**:
  ```
  Scenario: createAdapter returns LMUAdapterV2
    Tool: Bash (bun test)
    Steps: import createAdapter, call with 'lmu', check instance type
    Expected Result: Returns LMUAdapterV2 instance
    Evidence: .omo/evidence/sprint5b/task15-factory.log
  ```
  **Commit**: YES
  - Message: `refactor(desktop): rename LMU adapter v2 as primary, archive skeleton v1`
  - Files: `apps/desktop/src/main/sim/adapters/index.ts`, `apps/desktop/src/main/sim/adapters/lmu-adapter.ts`, `apps/desktop/src/main/sim/adapters/lmu-adapter-v1-skeleton.ts`

- [ ] 16. **Integration test: synthetic buffer round-trip**

  **What to do**:
  - Create integration test that:
    1. Constructs synthetic buffer with known values across all sub-structs
    2. Runs `parseLMUObjectOut()` on it
    3. Asserts specific expected output values
  - Test coverage:
    - Player telemetry: RPM=7200, gear=4, speed=15.0, fuel=45.2, all inputs
    - All 3 session scenarios: practice, qualifying, race
    - All game phases: garage, green, FCY, session over
    - Vehicle scoring: 5 vehicles with varied positions, gaps, pit states
    - classPosition: 2 classes with 4+ cars each
    - Wheel data: 4 wheels with different temps, pressures, wear

  **Must NOT do**:
  - NO depend on real LMU dump (synthetic only)
  - NO test REST here (separate test)

  **Recommended Agent Profile**:
  - Category: `deep` — comprehensive integration coverage
  - Skills: `typescript`

  **Parallelization**: Depends on T11 (needs parser) + T5-T10
  **Blocks**: Nothing

  **Acceptance Criteria**:
  - [ ] All 5+ scenarios pass with correct assertions
  - [ ] Each sub-struct has at least 3 field assertions
  - [ ] No hardcoded magic numbers — all values match known synthetic buffer input

  **QA Scenarios**:
  ```
  Scenario: Full round-trip with all scenarios
    Tool: Bun test packages/sim-core/src/__tests__/lmu-parser.test.ts
    Steps: Run the full integration test suite
    Expected Result: All integration tests pass
    Evidence: .omo/evidence/sprint5b/task16-integration.log
  ```
  **Commit**: YES
  - Message: `test(sim-core): add LMU parser integration tests`
  - Files: `packages/sim-core/src/__tests__/lmu-integration.test.ts`

- [ ] 17. **Integration test: real LMU fixture**

  **What to do**:
  - If `test-data/lmu-fixture.bin` exists (from T2), create test that:
    1. Reads `.bin` file
    2. Runs `parseLMUObjectOut()` on it
    3. Compares against `test-data/lmu-fixture.json` sidecar
  - Add test guard: skip test if fixture file doesn't exist
    ```typescript
    const fixtureExists = fs.existsSync('test-data/lmu-fixture.bin');
    const itIf = fixtureExists ? it : it.skip;
    ```
  - Assertions for key fields from JSON sidecar:
    - `trackName`, `sessionType`, `gamePhase`
    - `driverName` of player vehicle
    - `numVehicles` matches
    - First vehicle position

  **Must NOT do**:
  - NO fail CI if fixture doesn't exist (use conditional test)
  - NO modify the fixture files

  **Recommended Agent Profile**:
  - Category: `deep` — validates against real data
  - Skills: `typescript`

  **Parallelization**: Depends on T2 (needs fixture), T11 (needs parser)
  **Blocks**: Nothing

  **Acceptance Criteria**:
  - [ ] Conditional test passes when fixture exists
  - [ ] Key field assertions match JSON sidecar
  - [ ] Skipped in CI (no fixture)

  **QA Scenarios**:
  ```
  Scenario: Real LMU fixture parsed correctly (LMU required)
    Tool: Bash (bun test)
    Steps: Run test with fixture present
    Expected Result: All assertions pass against JSON sidecar
    Evidence: .omo/evidence/sprint5b/task17-real-fixture.log
  ```
  **Commit**: YES (with T16)
  - Files: `packages/sim-core/src/__tests__/lmu-integration.test.ts`

- [ ] 18. **Edge case tests**

  **What to do**:
  - Write tests for all edge cases:
    - **Buffer boundaries**: buffer 1 byte too small → return null gracefully
    - **Zero vehicles**: `mNumVehicles = 0` → empty array
    - **Game phase**: `mGamePhase = 0` → isOnTrack = false
    - **Pit states**: all 5 pit states tested (0-4)
    - **Sector mapping**: 0=sector3, 1=sector1, 2=sector2 (LMU weirdness)
    - **Driver name encoding**: special chars (accents, Unicode) → correct UTF-8 decode
    - **Fuel extremes**: mFuel=0, mFuelCapacity=0 → no crash, defaults
    - **Zero speeds**: mLocalVel=(0,0,0) → speed=0
    - **Negative gear**: mGear=-1 → reverse
    - **Empty strings**: all c_char fields empty → empty string fallback
    - **All timestamps zero**: session time 0 → no crash
    - **DFlap states**: all 3 rearFlapLegalStatus values (0, 1, 2)
    - **Player not found**: playerHasVehicle=false → playerTelemetry=null
    - **Full field**: numVehicles=104 with all entries valid
    - **Multiple wheel compounds**: fl soft, fr medium, rl hard, rr wet

  **Must NOT do**:
  - NO skip any of the 15+ edge cases

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — thorough
  - Skills: `typescript`

  **Parallelization**: Depends on T11 (needs parser)
  **Blocks**: Nothing

  **Acceptance Criteria**:
  - [ ] All 15+ edge cases pass
  - [ ] Each edge case tests a single specific failure mode
  - [ ] Zero crashes across all cases

  **QA Scenarios**:
  ```
  Scenario: All edge cases pass
    Tool: Bun test
    Steps: Run lmu-parser-edge-cases.test.ts
    Expected Result: 15+ tests pass
    Evidence: .omo/evidence/sprint5b/task18-edge-cases.log
  ```
  **Commit**: YES
  - Message: `test(sim-core): add LMU parser edge case tests (15+ cases)`
  - Files: `packages/sim-core/src/__tests__/lmu-parser.test.ts`

- [ ] 19. **Performance benchmark test**

  **What to do**:
  - Write benchmark test that:
    1. Constructs full 325KB synthetic buffer
    2. Runs `parseLMUObjectOut()` 1000 times
    3. Measures total time with `performance.now()`
    4. Assert: mean parse time < 5ms per call
  - Write to `.omo/evidence/sprint5b/task19-benchmark.log`

  **Must NOT do**:
  - NO include koffi/buffer copy time (only parser time)
  - NO run in CI on every push (tag as integration/benchmark)

  **Recommended Agent Profile**:
  - Category: `quick` — straightforward benchmark
  - Skills: `typescript`

  **Parallelization**: Depends on T11 (needs parser)
  **Blocks**: Nothing

  **Acceptance Criteria**:
  - [ ] Mean parse time < 5ms for 325KB buffer
  - [ ] Max parse time < 20ms (no GC pauses)
  - [ ] Results saved to evidence file

  **QA Scenarios**:
  ```
  Scenario: Parser under 5ms per tick
    Tool: Bun test
    Steps: Run benchmark, check mean time
    Expected Result: < 5ms per call
    Evidence: .omo/evidence/sprint5b/task19-benchmark.log
  ```
  **Commit**: YES (with T16, T17)
  - Message: `test(sim-core): add LMU parser benchmark test`
  - Files: `packages/sim-core/src/__tests__/lmu-benchmark.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run parse, check output). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify lmu-offsets.ts has no manual edits.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  From clean state: run every QA scenario from every task (or verify evidence). Test cross-task integration: full buffer → adapter → normalizer. Test edge cases: truncated buffer, zero vehicles, REST server down. Test performance benchmark.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: LMU task touching iRacing/AC files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1-2**: `feat(tools): add LMU offset generator and dump script`
- **3**: (with 1-2)
- **4**: `feat(sim-core): add LMU synthetic buffer constructor and parser skeleton`
- **5**: `feat(sim-core): add LMU generic and path data parser`
- **6**: `feat(sim-core): add LMU scoring info parser (session + weather)`
- **7**: `feat(sim-core): add LMU vehicle scoring parser`
- **8**: (with 7)
- **9-10**: `feat(sim-core): add LMU vehicle telemetry and wheel parsers`
- **11**: `feat(sim-core): add top-level LMUObjectOut parser`
- **12, 14**: `feat(desktop): add LMU adapter v2 with real shared memory parser`
- **13**: `feat(desktop): add LMU REST API client (brake wear, weather, strategy)`
- **15**: `refactor(desktop): rename LMU adapter v2 as primary, archive skeleton v1`
- **16-17**: `test(sim-core): add LMU parser integration tests`
- **18**: `test(sim-core): add LMU parser edge case tests (15+ cases)`
- **19**: (with 16-17)
- **F1-F4**: No commits (review phase)

## Success Criteria

### Verification Commands
```bash
bun test  # All 248 existing + 25+ new tests pass
pnpm typecheck  # No TypeScript errors
# Python offset generator runs
python tools/generate-lmu-offsets.py --output packages/sim-core/src/lmu-offsets.ts
# Synthetic buffer integration
bun test packages/sim-core/src/__tests__/lmu-integration.test.ts
# Benchmark
bun test packages/sim-core/src/__tests__/lmu-benchmark.test.ts
```

### Final Checklist
- [ ] All 19 implementation tasks completed
- [ ] All 4 Final Wave verifications PASS
- [ ] `bun test` passes (248 old + 25+ new = 273+ tests)
- [ ] `pnpm typecheck` passes
- [ ] LMU adapter v2 parses shared memory with correct struct offsets
- [ ] REST API client polls 3 endpoints without crashing
- [ ] Old skeleton archived, new adapter registered in createAdapter()
- [ ] Evidence saved to `.omo/evidence/sprint5b/`
- [ ] User explicitly approves before marking complete
