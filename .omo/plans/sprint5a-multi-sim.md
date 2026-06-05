# Sprint 5a — Multi-Sim: iRacing Real Adapter + Inspector + Sim Switching

## TL;DR

> **Quick Summary**: Implement real shared-memory adapters for iRacing (koffi/FFI), add Assetto Corsa UDP handshaker, refactor SimManager to wire real adapters, build Telemetry Inspector (Hub + standalone overlay), add NDJSON recording/replay for CI testing, and build sim switching UI in Hub sidebar.
>
> **Deliverables**:
> - iRacing real shared memory adapter (moved to Electron main process)
> - AC UDP handshaker protocol
> - SimManager with real adapter lifecycle (connect/poll/disconnect)
> - Telemetry Inspector F-023 (Hub page + standalone BrowserWindow)
> - NDJSON streaming recorder + replay reader
> - Sim switching UI in Hub sidebar
> - All adapters verified with recorded real data via koffi
>
> **Estimated Effort**: Large (11 tasks)
> **Parallel Execution**: YES — 3 waves + final verification
> **Critical Path**: T1 → T2 → T3 → T4 → T6 → T8 → F1-F4

---

## Context

### Original Request
Sprint 5 del ROADMAP: implementar adapters reales de iRacing y LMU (Multi-Sim). Dividido en 5a (iRacing + Inspector) y 5b (LMU).

### Interview Summary
**Key Decisions**:
| Decisión | Valor |
|----------|-------|
| SDK approach | **koffi/ffi-napi** — FFI puro, sin C++ addon |
| Sprint split | **5a + 5b** |
| Inspector | **Hub page + overlay standalone** |
| Testing | **Ambos** — recording/replay + mocks |
| LMU SDK | Usuario tiene acceso — en Vantare-Ingeniero |
| AC skeleton | **Mínimo** — solo handshaker + parseo básico |
| Adapters location | **apps/desktop/src/main/sim/adapters/** (no sim-core) |
| SimManager refactor | **Incluido** en Sprint 5a |

**Metis Findings** (gaps addressed):
- 🔴 sim-core vs desktop adapter split → resolved: adapters move to desktop
- 🔴 SimManager never instantiates real adapters → resolved: add real adapter lifecycle
- 🔴 iRacing wrong memory name/offsets → resolved: use `Local\\IRSDKMemMapFileName`, 1,164 KB, varHeader lookup
- 🔴 LMU placeholder buffer name → deferred to 5b
- 🔴 AC lacks handshaker → resolved: 12-byte handshaker protocol
- 🔴 `UnmapViewOfFile(this.hMapFile)` bug → resolved: use mapped view pointer

### Research Findings
**Open-Source References** (from librarian):
- **emilioSp/node-iracing-sdk** — Pure TS + koffi, 304 weekly downloads. Canonical koffi shared memory pattern for iRacing. GitHub: https://github.com/emilioSp/node-iracing-sdk
- **adnanademovic/simetry** — Rust structs canónicos: Header (112B), VarHeaderRaw (144B), VarBuf (16B). Confirmación de triple-buffering.
- **rickwest/ac-remote-telemetry-client** — Pure JS AC UDP handshaker: 12-byte handshake → 408B response → subscribe → 328B RT_CAR_INFO
- **TinyPedal/pyLMUSharedMemory** — LMU structs (referencia Python, usable en 5b)
- **Constants corrigendos**: iRacing `Local\IRacingSDK` → `Local\\IRSDKMemMapFileName` (1,164 KB), LMU `\\$` → `LMU_Data`

**Vantare-Ingeniero Assets**:
- LMU shared memory mapeado completo en Python ctypes (usable en 5b)
- Pipeline: lmu_reader → game_state_builder → frame_cache → history_store

---

## Work Objectives

### Core Objective
Implement iRacing real shared memory adapter (koffi/FFI) in Electron main process, refactor SimManager to wire real adapters, build Telemetry Inspector (Hub + overlay), add NDJSON recording/replay for CI testing, and build sim switching UI in Hub sidebar.

### Concrete Deliverables
- `apps/desktop/src/main/sim/adapters/iracing-adapter.ts` — iRacing adapter movido y reparado
- `apps/desktop/src/main/sim/adapters/lmu-adapter.ts` — LMU adapter movido (offsets corregidos en 5b)
- `apps/desktop/src/main/sim/adapters/ac-adapter.ts` — AC adapter movido + handshaker protocol
- `apps/desktop/src/main/sim/adapters/index.ts` — Barrel export
- `packages/sim-core/src/adapters/` — Stubs eliminados (se reemplazan por barrel que importa desde desktop)
- `apps/desktop/src/main/sim/sim-manager.ts` — Refactorizado con lifecycle real
- `apps/desktop/src/main/sim/telemetry-recorder.ts` — NDJSON streaming recorder
- `packages/sim-core/src/replay/` — Replay reader
- `apps/desktop/src/renderer/hub/pages/TelemetryInspectorPage.tsx` — Inspector Hub page
- `apps/desktop/src/main/inspector-window.ts` — Inspector standalone overlay
- `apps/desktop/src/renderer/hub/components/SimSwitcher.tsx` — Sim switching UI
- `shared/types/bridge.ts` — Nuevos canales IPC para inspect/recording/switching

### Definition of Done
- [ ] iRacing adapter: connect → parse real shared memory (varHeader lookup) → normalize → UnifiedTelemetryData
- [ ] AC adapter: handshake → subscribe → receive RT_CAR_INFO → normalize
- [ ] SimManager: detect process → instantiate adapter → poll → IPC broadcast → fallback a mock
- [ ] Inspector: muestra todos los campos de Telemetry en tiempo real a 16Hz
- [ ] Recording: NDJSON streaming a `userData/recordings/`, replay reader parsea correctamente
- [ ] Sim switching: sidebar dropdown cambia sim activo y recarga adapters
- [ ] All tests pass: `pnpm test --filter=@vantare/sim-core` && `pnpm test --filter=desktop`
- [ ] Typecheck: `pnpm typecheck` — 0 errors
- [ ] Build: Turbo build completes for desktop + overlay-app

### Must Have
- iRacing shared memory reader con **varHeader lookup por nombre** (no offsets hardcodeados)
- AC UDP con **handshaker protocol completo** (12-byte send → 408B receive → subscribe → data)
- SimManager con **real adapter lifecycle**: detect → instantiate → connect → poll → disconnect
- Recording NDJSON: **streaming write**, no en memoria
- Replay reader: **tolera última línea truncada** (archivos mid-write)
- Inspector: **renderiza todos los campos** sin re-renders masivos (selectores atómicos)
- `UnmapViewOfFile(view)` — usar el mapped view pointer, NO el handle del file mapping

### Must NOT Have (Guardrails)
- **No C++ native addon** — koffi/FFI puro, no node-addon-api, no binding.gyp
- **No LMU real adapter** — solo mover archivo, offsets se corrigen en Sprint 5b
- **No koffi imports a nivel módulo** — todos los FFI calls dentro de métodos de clase
- **No in-memory recording arrays** — streaming write a disco siempre
- **No Inspector con selectores que crean nuevos objetos cada frame** — selectores atómicos por campo
- **No tocar overlay-app** — solo apps/desktop + sim-core
- **No modificar mock system** — debe seguir funcionando como fallback
- **No tocar LMU struct mapping** — solo mover archivo, sin reparar offsets

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest, Playwright)
- **Automated tests**: **TDD** — tests first, then implementation
- **Framework**: Vitest (sim-core), Vitest + Playwright (desktop)
- **Recording**: Real telemetry data recorded → stored as NDJSON fixtures → replayed in tests

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/sprint5a/task-{N}-{scenario}.{ext}`.

- **Shared memory adapters**: Use koffi to read a recorded session file (pre-recorded NDJSON) to verify parsing
- **SimManager**: Verificar lifecycle con mock adapters + fake processes
- **Inspector**: Playwright — navigate to /inspector, verify fields render and update
- **Recording**: Write test data via recorder, read back via reader, verify byte-level equality
- **Sim switching**: Playwright — click sim dropdown, verify bridge IPC is called

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — starts immediately):
├── T1: Move adapters + fix critical bugs (constants, UnmapViewOfFile)
├── T2: SimManager refactor — real adapter lifecycle
└── T3: Barrel exports + delete old stubs

Wave 2 (Core implementation — after Wave 1):
├── T4: iRacing varHeader shared memory reader (REWRITE using emilioSp pattern)
├── T5: AC UDP handshaker protocol
├── T6: NDJSON streaming recorder + replay reader
└── T7: Bridge IPC channels for new features

Wave 3 (UI + integration — after Wave 2):
├── T8: Telemetry Inspector (Hub page + standalone overlay)
├── T9: Sim switching UI in sidebar
├── T10: Recording CLI/manual trigger
└── T11: Integration tests with recorded data

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **T1-T3**: Independent (Wave 1)
- **T4**: T1 (depends on iRacing adapter moved) — **iRacing offset rewrite** solo funcional con T1
- **T5**: T1 (depends on AC adapter moved)
- **T6**: Independent (recorder no depende de adapters)
- **T7**: T1 (bridge necesita nuevos canales)
- **T8**: T4, T5, T6, T7 (Inspector necesita datos reales + IPC + recording)
- **T9**: T2, T7 (sim switching necesita SimManager lifecycle + bridge)
- **T10**: T6 (recording trigger necesita recorder)
- **T11**: T4, T5, T6, T7 (integration tests necesitan todo funcionando)

---

## TODOs

- [x] 1. Move adapters to desktop/main + fix critical bugs

  **What to do**:
  - Create `apps/desktop/src/main/sim/adapters/` directory
  - Copy (don't move yet) the 3 adapters from `packages/sim-core/src/adapters/` to `apps/desktop/src/main/sim/adapters/`:
    - `iracing.ts` → `iracing-adapter.ts`
    - `lmu.ts` → `lmu-adapter.ts`
    - `ac.ts` → `ac-adapter.ts`
  - Fix critical bugs in copied files:
    - **iRacing**: `LOCAL_MEMORY_NAME` = `Local\\IRSDKMemMapFileName` (era: `Local\IRacingSDK`)
    - **iRacing**: `MEMORY_SIZE` = `1164 * 1024` (era: 65536)
    - **iRacing**: `UnmapViewOfFile(this.hMapFile)` → `UnmapViewOfFile(this.pBuf)` or `this.memMapView` — use the mapped view pointer
    - **LMU**: `TELEMETRY_BUFFER_NAME` = `'LMU_Data'` (era: `'\\$'`)
    - **LMU**: Same UnmapViewOfFile fix
  - Ensure koffi imports are INSIDE class methods, not at constructor level
    - Move `koffi.load('kernel32.dll')` calls from field initializers into the `connect()` method
    - Use lazy initialization pattern: `private lib?: ReturnType<typeof koffi.load>`
  - Ensure `require('dgram')` in AC adapter is inside `connect()` (dynamic require), not at module level
  - The LMU adapter offsets will remain as placeholders/guesses (fixed in Sprint 5b)

  **Must NOT do**:
  - No cambiar los stubs originales en sim-core todavía (se hace en T3)
  - No reparar offsets de LMU (Sprint 5b)
  - No reescribir parseSharedMemory de iRacing (T4)

  **Recommended Agent Profile**:
  > File move + constant fixes. Búsqueda y reemplazo, no lógica nueva.
  - **Category**: `quick`
    - Reason: Operación mecánica de mover archivos y corregir constantes
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T4, T5, T7
  - **Blocked By**: None (can start immediately)

  **References**:
  - `packages/sim-core/src/adapters/iracing.ts` — Source file to copy and fix
  - `packages/sim-core/src/adapters/lmu.ts` — Source file with `'\\$'` placeholder
  - `packages/sim-core/src/adapters/ac.ts` — Source file with `require('dgram')` at module level
  - `apps/desktop/src/main/sim/` — Target directory for new adapters
  - `node_modules/emilioSp/node-iracing-sdk/src/irsdk.ts` — Reference pattern for koffi: `UnmapViewOfFile(this.memMapView)`, not `hMapFile`

  **Acceptance Criteria**:
  - [ ] iracing-adapter.ts exists with `Local\\IRSDKMemMapFileName`, `1164 * 1024`, UnmapViewOfFile fix
  - [ ] ac-adapter.ts has `require('dgram')` only inside `connect()` method
  - [ ] All koffi.load() calls are inside class methods, not field initializers
  - [ ] `pnpm typecheck` — 0 errors

  **QA Scenarios**:
  ```
  Scenario: Verify adapter files moved and constants corrected
    Tool: Bash
    Preconditions: Sprint 5a branch checked out
    Steps:
      1. Grep "Local\\\\IRSDKMemMapFileName" in apps/desktop/src/main/sim/adapters/iracing-adapter.ts → found
      2. Grep "1164 \\* 1024" in iracing-adapter.ts → found (memory size)
      3. Grep "UnmapViewOfFile" in iracing-adapter.ts → NOT matching "hMapFile" (use grep pattern "hMapFile" → 0 matches in UnmapViewOfFile calls)
      4. Grep "LMU_Data" in lmu-adapter.ts → found (constant, not '\\$')
      5. Grep "koffi\\.load" in all 3 files → each found only inside class methods, not at module level
    Expected Result: All 5 checks pass
    Evidence: .omo/evidence/sprint5a/task-1-constants-fixed.txt

  Scenario: Typecheck passes
    Tool: Bash
    Steps:
      1. cd C:\Users\isaac\Desktop\Vantare-Overlays
      2. pnpm typecheck
    Expected Result: Exit code 0, no type errors
    Evidence: .omo/evidence/sprint5a/task-1-typecheck.txt
  ```

  **Commit**: YES
  - Message: `refactor(sim): move adapters to desktop/main, fix constants and UnmapViewOfFile bug`
  - Files: `apps/desktop/src/main/sim/adapters/*.ts`
  - Pre-commit: `pnpm typecheck`

- [x] 2. Refactor SimManager with real adapter lifecycle

  **What to do**:
  - Modify `apps/desktop/src/main/sim/sim-manager.ts`:
    - Import adapters from `./adapters/index`
    - Change `activateSim(simName: string)` to instantiate the correct adapter:
      ```typescript
      private activeAdapter: SimAdapter | null = null;

      private activateSim(simName: string): void {
        this.isMockActive = false;
        this.currentSim = simName;
        this.connected = true;
        // Destroy old adapter
        this.activeAdapter?.destroy();
        // Create new adapter based on simName
        this.activeAdapter = createAdapter(simName);
        this.activeAdapter.connect();
        this.activeAdapter.onTelemetry((data) => this.handleTelemetry(data));
        this.activeAdapter.onConnectionState((state) => this.handleState(state));
        this.emitSimState();
      }
      ```
    - Change `getTelemetry()` to poll from `this.activeAdapter`
    - Add `createAdapter(simName: string): SimAdapter` factory function
    - Add error handling: if connect() fails, fall back to mock
    - Add `handleTelemetry(data)` that pushes to IPC and broadcast
    - Ensure `stop()` calls `activeAdapter.destroy()`
    - Ensure `detectSim()` handles adapter re-instantiation when process changes

  **Must NOT do**:
  - No cambiar el mock fallback — debe seguir funcionando
  - No cambiar la estructura de IPC (solo usar los canales existentes)
  - No tocar la UI del sidebar (T9)

  **Recommended Agent Profile**:
  > Refactor lógico con manejo de lifecycle y errores.
  - **Category**: `deep`
    - Reason: Cambio arquitectónico en el corazón del sistema. Manejo de lifecycle, errores, estados
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: T9 (sim switching necesita SimManager con real adapters)
  - **Blocked By**: None (puede testear con adapters mock)

  **References**:
  - `apps/desktop/src/main/sim/sim-manager.ts` — File to refactor (current: 128 lines)
  - `packages/sim-core/src/adapters/base.ts` — SimAdapter interface (connect, disconnect, onTelemetry, destroy)
  - `apps/desktop/src/main/sim/adapters/iracing-adapter.ts` — Reference for adapter instantiation
  - `apps/desktop/src/main/sim/sim-manager.ts:92-97` — Current `activateSim()` (solo flags, sin adapters)
  - `apps/desktop/src/main/sim/sim-manager.ts:109-115` — Current `getTelemetry()` (siempre null en modo real)

  **Acceptance Criteria**:
  - [ ] `activateSim('iracing')` instancia `IRacingAdapter` y llama `connect()`
  - [ ] `activateSim('lmu')` instancia `LMUAdapter` y llama `connect()`
  - [ ] `activateSim('ac')` instancia `ACAdapter` y llama `connect()`
  - [ ] `activateMock()` sigue funcionando como fallback
  - [ ] `getTelemetry()` retorna datos del adapter activo (no null)
  - [ ] `stop()` llama `activeAdapter.destroy()`
  - [ ] Si connect() falla, fallback a mock
  - [ ] `pnpm typecheck` — 0 errors
  - [ ] Existing mock tests still pass

  **QA Scenarios**:
  ```
  Scenario: SimManager instantiates correct adapter for each sim
    Tool: Bash (bun test)
    Preconditions: SimManager refactor complete, mock adapters available
    Steps:
      1. Run: pnpm test --filter=desktop -- --run src/main/sim/__tests__/sim-manager.test.ts
      2. Check output contains test names: "✓ instantiates IRacingAdapter for iracing"
      3. Check output contains test names: "✓ instantiates LMUAdapter for lmu"
      4. Check output contains test names: "✓ instantiates ACAdapter for ac"
      5. Check output: "✓ falls back to mock on connect failure"
    Expected Result: All 5 test cases pass
    Evidence: .omo/evidence/sprint5a/task-2-sim-manager-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(sim): refactor SimManager with real adapter lifecycle (connect/poll/disconnect)`
  - Files: `apps/desktop/src/main/sim/sim-manager.ts`
  - Pre-commit: `pnpm typecheck && pnpm test --filter=desktop`

- [x] 3. Barrel exports + delete old sim-core stubs

  **What to do**:
  - Create `apps/desktop/src/main/sim/adapters/index.ts` barrel export:
    ```typescript
    export { IRacingAdapter } from './iracing-adapter';
    export { LMUAdapter } from './lmu-adapter';
    export { ACAdapter } from './ac-adapter';
    export { createAdapter } from './factory'; // or include in index
    ```
  - Add a factory function `createAdapter(simName: string): SimAdapter` that maps sim names to adapter classes
  - Delete these files from `packages/sim-core/src/adapters/`:
    - `iracing.ts`
    - `lmu.ts`
    - `ac.ts`
  - Update `packages/sim-core/src/adapters/index.ts` to only export:
    - `base.ts` (SimAdapter interface) — KEEP
    - Remove iRacingAdapter, LMUAdapter, ACAdapter exports that referenced deleted files
  - Update any imports in sim-core that referenced the deleted classes
  - Update any imports in desktop that should now point to the new location

  **Must NOT do**:
  - No eliminar `base.ts` (lo necesita sim-core para tipo SimAdapter)
  - No eliminar `normalizer.ts` (sim-core lo necesita)
  - No eliminar `mock/` directory
  - No cambiar nombres de clase (IRacingAdapter, LMUAdapter, ACAdapter) — solo mover

  **Recommended Agent Profile**:
  > Operación mecánica de barrel exports + file deletion.
  - **Category**: `quick`
    - Reason: Operación de archivos, sin lógica nueva
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: None (Wave 1 completa)
  - **Blocked By**: None

  **References**:
  - `packages/sim-core/src/adapters/index.ts` — Current barrel to modify
  - `apps/desktop/src/main/sim/adapters/iracing-adapter.ts` — New location
  - Use `lsp_find_references` to find all imports of `@vantare/sim-core` that import adapter classes

  **Acceptance Criteria**:
  - [ ] `apps/desktop/src/main/sim/adapters/index.ts` exports all 3 adapters + createAdapter
  - [ ] `packages/sim-core/src/adapters/iracing.ts` deleted
  - [ ] `packages/sim-core/src/adapters/lmu.ts` deleted
  - [ ] `packages/sim-core/src/adapters/ac.ts` deleted
  - [ ] `packages/sim-core/src/adapters/index.ts` only exports base.ts
  - [ ] All imports updated — `pnpm typecheck` passes
  - [ ] `pnpm test` passes

  **QA Scenarios**:
  ```
  Scenario: Old stubs deleted, new barrel works
    Tool: Bash
    Preconditions: Task 3 complete
    Steps:
      1. Test: Test-Path "packages/sim-core/src/adapters/iracing.ts" → False
      2. Test: Test-Path "packages/sim-core/src/adapters/lmu.ts" → False
      3. Test: Test-Path "packages/sim-core/src/adapters/ac.ts" → False
      4. Test: Test-Path "apps/desktop/src/main/sim/adapters/index.ts" → True
      5. pnpm typecheck → exit 0
    Expected Result: Old files deleted, new barrel present, typecheck clean
    Evidence: .omo/evidence/sprint5a/task-3-barrel.txt

  Scenario: Tests still pass
    Tool: Bash
    Steps:
      1. pnpm test --filter=@vantare/sim-core
    Expected Result: All tests pass
    Evidence: .omo/evidence/sprint5a/task-3-tests.txt
  ```

  **Commit**: YES
  - Message: `refactor(sim): barrel exports, delete old sim-core stubs`
  - Files: `packages/sim-core/src/adapters/` (deletions), `apps/desktop/src/main/sim/adapters/index.ts`
  - Pre-commit: `pnpm typecheck && pnpm test --filter=@vantare/sim-core`

- [x] 4. iRacing varHeader shared memory reader (koffi/FFI)

  **What to do**:
  - Rewrite `parseSharedMemory()` in `apps/desktop/src/main/sim/adapters/iracing-adapter.ts` to use **varHeader lookup by name** (not hardcoded offsets)
  - Reference: emilioSp/node-iracing-sdk + simetry struct definitions
  - Algorithm:
    1. Read Header at offset 0 (112 bytes):
       - `ver` int32 at +0
       - `status` int32 at +4
       - `tick_rate` int32 at +8
       - `session_info_update` int32 at +12
       - `session_info_len` int32 at +16
       - `session_info_offset` int32 at +20
       - `num_vars` int32 at +24
       - `var_header_offset` int32 at +28
       - `num_buf` int32 at +32
       - `buf_len` int32 at +36
       - `pad[2]` at +40
       - `var_buf[4]` (each 16 bytes) at +48
         - `tick_count` int32, `buf_offset` int32, `pad[2]`
    2. Find latest buffer: sort var_buf by tick_count, pick highest
    3. Read VarHeader array at `var_header_offset`:
       - Each VarHeader = 144 bytes
       - `type` int32, `offset` int32, `count` int32, `count_as_time` uint8, `pad[3]`, `name[32]`, `desc[64]`, `unit[32]`
    4. For each needed field (speed, rpm, gear, throttle, etc.):
       - Search varHeader array for matching `name`
       - Field value = buf[latest_varBuf.buf_offset + varHeader.offset]
       - Use correct type width based on varHeader.type (0=1B, 1=1B, 2=4B, 3=4B, 4=4B, 5=8B)
    5. Build Record<string, unknown> with field names matching normalizer expectations
  - Store parsed header info to avoid re-parsing headers every tick (only re-parse if `session_info_update` changes or at a lower rate)
  - Map var names to the exact names used by extractIRacing in normalizer.ts

  **Must NOT do**:
  - No modificar el normalizer — el output del parseSharedMemory debe ser compatible con extractIRacing
  - No agregar dependencias externas (koffi ya está)
  - No parsear session info YAML (solo telemetry variables)

  **Recommended Agent Profile**:
  > Implementación de parseo de shared memory con struct binario complejo. Requiere atención a offsets y tipos.
  - **Category**: `deep`
    - Reason: Parseo binario de struct C con triple-buffering. Fácil equivocarse en offsets
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T11
  - **Blocked By**: T1 (iracing adapter moved)

  **References**:
  - `apps/desktop/src/main/sim/adapters/iracing-adapter.ts` — File to rewrite parseSharedMemory in
  - `node_modules/emilioSp/node-iracing-sdk/src/irsdk.ts` — koffi shared memory pattern completo + varHeader lookup
  - `node_modules/emilioSp/node-iracing-sdk/src/vars.ts` — 250+ variable name constants
  - `src/iracing/header.rs` from adnanademovic/simetry — Rust struct canónico: Header (112B), VarHeaderRaw (144B), VarBuf (16B)
  - `packages/sim-core/src/normalizer.ts:extractIRacing()` — Expected field names in parser output
  - `packages/sim-core/src/types/index.ts` — Telemetry type definition
  - READ the Rust structs FIRST: `Header { ver, status, tick_rate, session_info_update, session_info_len, session_info_offset, num_vars, var_header_offset, num_buf, buf_len, pad[2], var_buf[4] }` (total: 112 bytes)
  - READ the emilioSp irsdk.ts for the exact koffi decode pattern: `koffi.decode(view, uint8, size)` → byte array → manual struct parsing

  **Acceptance Criteria**:
  - [ ] `parseSharedMemory()` usa varHeader lookup: busca `name` en array → usa `offset` + `buf_offset`
  - [ ] Maneja triple-buffering: selecciona varBuf con mayor tick_count
  - [ ] Output compatible con `extractIRacing()` en normalizer (mismos field names)
  - [ ] Detecta versión de irsdk y retorna null si incompatible
  - [ ] No parsea session info YAML (solo telemetry variables)
  - [ ] Caches headers (no re-parsea varHeaders en cada tick, solo si session_info_update cambia)
  - [ ] `pnpm typecheck` — 0 errors
  - [ ] Tests con datos grabados (NDJSON replay) pasan

  **QA Scenarios**:
  ```
  Scenario: iRacing parser reads varHeader and produces expected fields
    Tool: Bash (bun test)
    Preconditions: Recorded iRacing session NDJSON file available in test/fixtures/
    Steps:
      1. Run: pnpm test --filter=desktop -- --run src/main/sim/__tests__/iracing-adapter.test.ts
      2. Check output: test "parses varHeader and finds field by name" → PASS
      3. Check output: test "selects latest buffer by tick_count" → PASS
      4. Check output: test "produces output compatible with extractIRacing" → PASS
      5. Check output: test "returns null for unsupported irsdk version" → PASS
    Expected Result: All 4 test cases pass
    Evidence: .omo/evidence/sprint5a/task-4-iracing-tests.txt

  Scenario: Typecheck passes
    Tool: Bash
    Steps:
      1. cd C:\Users\isaac\Desktop\Vantare-Overlays
      2. pnpm typecheck
    Expected Result: Exit code 0
    Evidence: .omo/evidence/sprint5a/task-4-typecheck.txt
  ```

  **Commit**: YES
  - Message: `feat(sim): iRacing varHeader shared memory reader (koffi/FFI)`
  - Files: `apps/desktop/src/main/sim/adapters/iracing-adapter.ts`, `apps/desktop/src/main/sim/adapters/__tests__/iracing-adapter.test.ts`
  - Pre-commit: `pnpm typecheck && pnpm test --filter=desktop`

- [x] 5. AC UDP handshaker protocol

  **What to do**:
  - Add handshaker protocol to `apps/desktop/src/main/sim/adapters/ac-adapter.ts`:
    1. After socket.bind(), send 12-byte handshaker:
       ```
       Buffer.alloc(12)
       .writeInt32LE(0, 0)    // identifier = 0 (eIPhoneDevice)
       .writeInt32LE(1, 4)    // version = 1
       .writeInt32LE(0, 8)    // operation = HANDSHAKE
       ```
       Send to AC server (usually localhost) on port 9996
    2. Wait for 408-byte response (timeout: 5s)
       - Parse: carName (UTF-16LE, 100 chars), driverName (UTF-16LE, 100 chars), identifier, version, trackName (UTF-16LE, 100 chars)
    3. Send subscribe:
       ```
       Buffer.alloc(12)
       .writeInt32LE(0, 0)    // identifier
       .writeInt32LE(1, 4)    // version
       .writeInt32LE(1, 8)    // operation = SUBSCRIBE_UPDATE
       ```
    4. Start receiving 328-byte RT_CAR_INFO packets
    5. Parse RT_CAR_INFO (see reference for exact field offsets)
  - Parse RT_CAR_INFO fields into the expected Record<string, unknown> format for extractAC normalizer:
    - `speedKmh` at offset 8
    - `rpm` at offset 68
    - `gear` at offset 76 (int32, -1=reverse, 0=neutral)
    - `gas` at offset 56 (0.0-1.0)
    - `brake` at offset 60 (0.0-1.0)
    - `clutch` at offset 64 (0.0-1.0)
    - `steerAngle` at offset 72
    - `lastLap` at offset 44 (ms)
    - `bestLap` at offset 48 (ms)
    - `numberOfLaps` at offset 52
    - `lap` at offset 52 (int32)
    - `isInPit` at offset 24 (byte)
    - `fuel` at offset ... (check RT_CAR_INFO spec — may need to derive from other fields)
  - Add timeout/disconnect handling (DISMISS on disconnect: operation=3)

  **Must NOT do**:
  - No cambiar el formato de output — debe ser compatible con extractAC() en normalizer
  - No agregar parsing de session info YAML

  **Recommended Agent Profile**:
  > Implementación de protocolo UDP con handshake. Protocolo bien documentado.
  - **Category**: `unspecified-high`
    - Reason: Protocolo UDP con estados (handshake → subscribe → data), parseo binario
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T11
  - **Blocked By**: T1 (AC adapter moved)

  **References**:
  - `apps/desktop/src/main/sim/adapters/ac-adapter.ts` — File to add handshaker to
  - `github.com/rickwest/ac-remote-telemetry-client/src/index.js` — Full AC handshaker implementation (12-byte handshaker + 408B response + subscribe + RT_CAR_INFO)
  - `github.com/rickwest/ac-remote-telemetry-client/src/parsers/HandshakerResponseParser.js` — Handshake response parser (408 bytes)
  - `github.com/rickwest/ac-remote-telemetry-client/src/parsers/RTCarInfoParser.js` — RT_CAR_INFO parser (328 bytes, all field offsets)
  - `packages/sim-core/src/normalizer.ts:extractAC()` — Expected field names: speedKmh, rpm, gear, gas, brake, clutch, steerAngle, lastLap, bestLap, numberOfLaps, isInPit, lap

  **Acceptance Criteria**:
  - [ ] Handshaker sends correct 12-byte packet: [0, 1, 0] (identifier, version, HANDSHAKE)
  - [ ] Subscribe sends correct 12-byte packet: [0, 1, 1] (SUBSCRIBE_UPDATE)
  - [ ] Parses 408-byte response: carName, driverName, trackName
  - [ ] Parses 328-byte RT_CAR_INFO packets into correct fields
  - [ ] Compatible with extractAC() normalizer
  - [ ] Timeout: 5s if no response
  - [ ] DISMISS on disconnect (operation=3)
  - [ ] `pnpm typecheck` — 0 errors

  **QA Scenarios**:
  ```
  Scenario: Handshaker packet construction
    Tool: Bash (bun test)
    Preconditions: AC adapter test file exists
    Steps:
      1. Run: pnpm test --filter=desktop -- --run src/main/sim/__tests__/ac-adapter.test.ts
      2. Check: test "handshaker packet has correct bytes" → PASS (verifies [0,0,0,0, 1,0,0,0, 0,0,0,0])
      3. Check: test "subscribe packet has operation=1" → PASS
      4. Check: test "parse RT_CAR_INFO extracts speed, rpm, gear" → PASS
      5. Check: test "dismiss on disconnect" → PASS
    Expected Result: All tests pass
    Evidence: .omo/evidence/sprint5a/task-5-ac-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(sim): AC UDP handshaker protocol`
  - Files: `apps/desktop/src/main/sim/adapters/ac-adapter.ts`, `apps/desktop/src/main/sim/adapters/__tests__/ac-adapter.test.ts`
  - Pre-commit: `pnpm typecheck && pnpm test --filter=desktop`

- [x] 6. NDJSON streaming recorder + replay reader

  **What to do**:
  - Create `apps/desktop/src/main/sim/telemetry-recorder.ts`:
    - `startRecording(filePath: string): void` — Opens write stream
    - `writeFrame(data: Telemetry): void` — Appends JSON line + newline to file
    - `stopRecording(): void` — Closes stream
    - File path: `app.getPath('userData')/recordings/{sim}-{timestamp}.ndjson`
    - Streaming: using `fs.createWriteStream()` with auto-flush
    - Header: first line is metadata JSON: `{"version":1,"sim":"iracing","startedAt":...,"fields":[...]}`
  - Create `packages/sim-core/src/replay/replay-reader.ts`:
    - `ReplayReader.open(filePath: string): AsyncIterable<Telemetry>`
    - Parse NDJSON line by line
    - Handle truncated last line gracefully (if ends without newline, ignore partial line)
    - Export `ReplayFrame` type: `{ timestamp: number, data: Telemetry }`
    - Yield frames in order
  - Create `packages/sim-core/src/replay/index.ts`
  - Add recording directory creation: `mkdirSync(recordingsPath, { recursive: true })`

  **Must NOT do**:
  - No acumular en memoria — siempre streaming write
  - No modificar Telemetry type
  - No agregar compressión (NDJSON plano)

  **Recommended Agent Profile**:
  > Implementación de streaming I/O. Patrón estable, sin lógica compleja.
  - **Category**: `unspecified-high`
    - Reason: Streaming write + parse, manejo de archivos, edge case de línea truncada
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (no depende de adapters)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T10, T11
  - **Blocked By**: None

  **References**:
  - `packages/sim-core/src/types/index.ts` — Telemetry type to record
  - `Node.js fs.createWriteStream` docs — Streaming write pattern
  - `packages/sim-core/src/` — Target directory for replay reader
  - `apps/desktop/src/main/sim/` — Target directory for recorder

  **Acceptance Criteria**:
  - [ ] Recorder writes NDJSON: metadata header line + one JSON line per frame
  - [ ] Recorder uses streaming write (no in-memory array)
  - [ ] Replay reader parses complete files correctly
  - [ ] Replay reader handles truncated last line (no crash)
  - [ ] Records to `userData/recordings/{sim}-{timestamp}.ndjson`
  - [ ] `pnpm typecheck` — 0 errors

  **QA Scenarios**:
  ```
  Scenario: Record and replay produces same data
    Tool: Bash (bun test)
    Preconditions: Recorder and reader implemented
    Steps:
      1. Create a test Telemetry object
      2. Write it via recorder to a temp file
      3. Read it back via replay reader
      4. Assert: replayed data matches original (deep equal)
    Expected Result: Round-trip preserves data exactly
    Evidence: .omo/evidence/sprint5a/task-6-roundtrip.txt

  Scenario: Truncated last line handled gracefully
    Tool: Bash (bun test)
    Steps:
      1. Write 3 complete frames + 1 incomplete last line
      2. Read via replay reader
      3. Assert: 3 frames returned (not 4, no crash)
    Expected Result: Truncated line silently ignored
    Evidence: .omo/evidence/sprint5a/task-6-truncated.txt
  ```

  **Commit**: YES
  - Message: `feat(sim): NDJSON streaming recorder + replay reader`
  - Files: `apps/desktop/src/main/sim/telemetry-recorder.ts`, `packages/sim-core/src/replay/`
  - Pre-commit: `pnpm typecheck && pnpm test`

- [x] 7. Bridge IPC channels for new features

  **What to do**:
  - Add new IPC channels to `shared/types/bridge.ts`:
    ```typescript
    // Sim switching
    setActiveSim(simId: string): void;
    getAvailableSims(): string[];
    onSimListChanged(callback: (sims: string[]) => void): () => void;

    // Recording
    startRecording(): void;
    stopRecording(): string | null; // returns file path or null
    isRecording(): boolean;
    onRecordingStateChanged(callback: (recording: boolean) => void): () => void;

    // Inspector
    getInspectorData(): Telemetry | null;
    onInspectorData(callback: (data: Telemetry) => void): () => void;
    ```
  - Wire handlers in `apps/desktop/src/main/ipc/handlers.ts`:
    - `setActiveSim` → calls `simManager.activateSim()`
    - `startRecording` → calls `recorder.startRecording()`
    - `stopRecording` → calls `recorder.stopRecording()`
    - `getInspectorData` → returns latest telemetry from simManager
    - `onInspectorData` → subscribes to simManager telemetry
  - Wire preload in `apps/desktop/src/preload/index.ts`:
    - Expose all new methods via `contextBridge.exposeInMainWorld('vantare', ...)`

  **Must NOT do**:
  - No modificar canales IPC existentes (telemetry, session, sim-state)
  - No romper compatibilidad con overlays existentes

  **Recommended Agent Profile**:
  > Extensión de bridge IPC existente. Patrón establecido.
  - **Category**: `quick`
    - Reason: Agregar canales IPC siguiendo pattern existente
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T9, T10
  - **Blocked By**: T1 (necesita estructura de adapters existente)

  **References**:
  - `shared/types/bridge.ts` — Bridge type definitions to extend
  - `apps/desktop/src/main/ipc/handlers.ts` — IPC handlers to wire
  - `apps/desktop/src/preload/index.ts` — Preload to expose
  - `apps/desktop/src/main/sim/sim-manager.ts` — Source for setActiveSim + getTelemetry
  - `apps/desktop/src/main/sim/telemetry-recorder.ts` — Source for recording controls

  **Acceptance Criteria**:
  - [ ] Bridge types defined for all 7 new methods
  - [ ] IPC handlers wire all 7 methods to sim-manager + recorder
  - [ ] Preload exposes all methods via contextBridge
  - [ ] `pnpm typecheck` — 0 errors
  - [ ] Existing IPC tests still pass

  **QA Scenarios**:
  ```
  Scenario: New IPC channels exist and are callable
    Tool: Bash (bun test)
    Preconditions: Bridge wired
    Steps:
      1. Run: pnpm test --filter=desktop -- --run src/main/ipc/__tests__/handlers.test.ts
      2. Check: test "setActiveSim calls simManager.activateSim" → PASS
      3. Check: test "startRecording calls recorder.startRecording" → PASS
      4. Check: test "stopRecording returns file path" → PASS
      5. Check: test "getInspectorData returns latest telemetry" → PASS
    Expected Result: All IPC channel tests pass
    Evidence: .omo/evidence/sprint5a/task-7-ipc-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(ipc): bridge channels for inspector, recording, sim switching`
  - Files: `shared/types/bridge.ts`, `apps/desktop/src/main/ipc/handlers.ts`, `apps/desktop/src/preload/index.ts`
  - Pre-commit: `pnpm typecheck && pnpm test --filter=desktop`

- [ ] 8. Telemetry Inspector (Hub page + standalone overlay)

  **What to do**:
  - Create Hub page component: `apps/desktop/src/renderer/hub/pages/TelemetryInspectorPage.tsx`
    - Subscribe to `getInspectorData()` / `onInspectorData()` from bridge
    - Render all telemetry fields organized by category:
      - **Player**: speed, rpm, gear, position, lapDistance, driverName, carNumber
      - **Engine**: rpm, maxRpm, fuelLevel, fuelCapacity, waterTemp, oilTemp, oilPressure
      - **Inputs**: throttle, brake, clutch, steering
      - **Lap**: currentLap, totalLaps, lastLaptime, bestLaptime, sector times
      - **Session**: type, state, timeRemaining, timeElapsed, trackName
      - **Weather**: airTemp, trackTemp, humidity, precipitation, windSpeed
      - **Tyres**: fl/fr/rl/rr (temp, pressure, wear)
    - Use atomic Zustand selectors to prevent mass re-renders:
      ```typescript
      // GOOD: selector per field
      const speed = useInspectorStore(s => s.data?.player.speed);
      // BAD: selector returns new object every time
      const player = useInspectorStore(s => s.data?.player); // NO
      ```
    - Auto-scroll: latest data at top or bottom (configurable)
    - Rate-limited: update display at max 16Hz regardless of data rate
    - Add route: `/inspector` in HubLayout
  - Create standalone overlay: `apps/desktop/src/main/inspector-window.ts`
    - `createInspectorWindow(parentWindow?: BrowserWindow): BrowserWindow`
    - Load the same Inspector component as a separate BrowserWindow
    - Transparent, frameless, resizable
    - Can be positioned independently for multi-monitor setups
    - Receives telemetry via the same IPC bridge (sim-manager broadcasts to all windows)
  - Create shared Inspector component in `apps/desktop/src/renderer/hub/components/TelemetryInspector.tsx`
    - Used by both Hub page and standalone overlay
    - Props: `data: Telemetry | null`, `compact?: boolean`

  **Must NOT do**:
  - No crear selectores que devuelvan objetos nuevos cada frame
  - No modificar los overlays existentes (standings, relative, delta bar)
  - No agregar dependencias externas de UI

  **Recommended Agent Profile**:
  > Componente React con actualización en tiempo real. Requiere optimización de rendimiento.
  - **Category**: `visual-engineering`
    - Reason: UI en tiempo real con restricciones de rendimiento a 16Hz
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T4, T5, T6, T7)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T4 or T5 (needs real adapter data), T7 (needs IPC bridge)

  **References**:
  - `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx` — Existing Hub page pattern to follow
  - `apps/desktop/src/renderer/hub/HubLayout.tsx` — Routing setup
  - `apps/desktop/src/renderer/hub/components/` — Component pattern
  - `apps/desktop/src/main/overlay-window.ts` — Existing overlay window pattern
  - `shared/types/bridge.ts` — IPC channels for inspector data
  - `packages/sim-core/src/types/index.ts` — Telemetry type definition (all fields)

  **Acceptance Criteria**:
  - [ ] Inspector page renders at `/inspector` in Hub with all telemetry categories
  - [ ] Uses atomic selectors (no full-object selectors that trigger re-renders every frame)
  - [ ] Rate-limited to max 16Hz display updates
  - [ ] Standalone overlay: `createInspectorWindow()` creates a transparent, frameless window
  - [ ] Shared component: both Hub page and overlay use the same TelemetryInspector component
  - [ ] `pnpm typecheck` — 0 errors

  **QA Scenarios**:
  ```
  Scenario: Inspector renders telemetry fields
    Tool: Playwright
    Preconditions: Desktop app running in dev mode with mock data
    Steps:
      1. Navigate to http://localhost:5173/inspector
      2. Wait for page to load
      3. Assert: text "Speed" is visible on page
      4. Assert: text "RPM" is visible on page
      5. Assert: text "Gear" is visible on page
      6. Assert: numeric values are present (not empty)
    Expected Result: All telemetry fields rendered with live values
    Evidence: .omo/evidence/sprint5a/task-8-inspector-page.png

  Scenario: Standalone overlay window opens
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:5173/
      2. Click "Open Inspector" (or trigger via bridge)
      3. New window appears with inspector data
    Expected Result: Standalone BrowserWindow with same inspector content
    Evidence: .omo/evidence/sprint5a/task-8-overlay.png
  ```

  **Commit**: YES
  - Message: `feat(hub): Telemetry Inspector page + standalone overlay`
  - Files: `apps/desktop/src/renderer/hub/pages/TelemetryInspectorPage.tsx`, `apps/desktop/src/main/inspector-window.ts`, `apps/desktop/src/renderer/hub/components/TelemetryInspector.tsx`, `apps/desktop/src/renderer/hub/HubLayout.tsx`
  - Pre-commit: `pnpm typecheck && pnpm test --filter=desktop`

- [ ] 9. Sim switching UI in Hub sidebar

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/components/SimSwitcher.tsx`:
    - Subscribe to `getAvailableSims()` → get list of sims
    - Subscribe to current sim state from bridge
    - Render a dropdown/select showing available sims with the currently active sim selected
    - On change: call `setActiveSim(simId)`
    - Show visual indicator: connected/disconnected (green/red dot)
    - Show mock badge if `isMock` is true
  - Wire into `arrange` IPC: `onSimListChanged` callback updates available list
  - Style: compact, fits in sidebar header area, dark theme consistent with Hub
  - Handle edge cases: no sims available (show "No sim detected"), switching while recording (warn)

  **Must NOT do**:
  - No cambiar el layout del sidebar (solo agregar componente)
  - No romper sim-switching durante recording (solo warn, no block)

  **Recommended Agent Profile**:
  > Componente React simple, dropdown selector.
  - **Category**: `visual-engineering`
    - Reason: UI component con estado reactivo
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T2, T7)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T2 (SimManager con lifecycle), T7 (IPC bridge para setActiveSim)

  **References**:
  - `apps/desktop/src/renderer/hub/HubLayout.tsx` — Sidebar to add SimSwitcher to
  - `apps/desktop/src/renderer/hub/components/` — Component placement
  - `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx` — Already shows sim status
  - `shared/types/bridge.ts` — getAvailableSims, setActiveSim, onSimListChanged
  - `apps/desktop/src/renderer/hub/stores/` — Zustand store pattern

  **Acceptance Criteria**:
  - [ ] SimSwitcher shows dropdown of available sims
  - [ ] Currently active sim is selected by default
  - [ ] On selection change: calls `window.vantare.setActiveSim(simId)`
  - [ ] Green/red dot indicator for connected/disconnected state
  - [ ] Mock badge visible when `isMock` is true
  - [ ] "No sim detected" shown when available sims list is empty
  - [ ] Sidebar layout unchanged (component fits in header area)
  - [ ] `pnpm typecheck` — 0 errors

  **QA Scenarios**:
  ```
  Scenario: SimSwitcher renders and allows switching
    Tool: Playwright
    Preconditions: Desktop app running in dev mode, mock enabled
    Steps:
      1. Navigate to http://localhost:5173/
      2. Assert: SimSwitcher dropdown visible in sidebar
      3. Assert: Shows "iRacing" (or first available sim) as selected
      4. Assert: Green dot visible (simulated "connected")
      5. Click dropdown, select different sim
      6. Assert: new sim shown as selected
    Expected Result: SimSwitcher functional
    Evidence: .omo/evidence/sprint5a/task-9-sim-switcher.png

  Scenario: Mock badge displayed
    Tool: Playwright
    Steps:
      1. Navigate to localhost:5173 with mock active
      2. Assert: "Mock" badge visible in SimSwitcher
    Expected Result: Mock indicator visible
    Evidence: .omo/evidence/sprint5a/task-9-mock-badge.png
  ```

  **Commit**: YES
  - Message: `feat(hub): sim switching UI in sidebar`
  - Files: `apps/desktop/src/renderer/hub/components/SimSwitcher.tsx`, `apps/desktop/src/renderer/hub/HubLayout.tsx`
  - Pre-commit: `pnpm typecheck && pnpm test --filter=desktop`

- [ ] 10. Recording trigger

  **What to do**:
  - Add recording control to SimManager or as a separate module:
    - `startRecording(): Promise<string>` — starts recorder, returns file path
    - `stopRecording(): string | null` — stops recorder, returns file path or null
    - `isRecording(): boolean` — current recording state
  - Wire recording trigger to SimManager's telemetry pipeline:
    - When SimManager receives telemetry data, pipe to recorder if recording
  - Add IPC handlers for start/stop recording (from T7 bridge)
  - Optional: add UI indicator in Hub header showing recording status (red dot + duration)
  - Auto-naming: `{sim}-{YYYY-MM-DD}_{HH-mm-ss}.ndjson`

  **Must NOT do**:
  - No agregar UI compleja (solo indicator básico)
  - No comprimir archivos

  **Recommended Agent Profile**:
  > Integración de recorder con SimManager + IPC. Patrón establecido.
  - **Category**: `unspecified-high`
    - Reason: Integración de recorder en pipeline de telemetría
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T6)
  - **Parallel Group**: Wave 3
  - **Blocks**: T11
  - **Blocked By**: T6 (recorder), T7 (bridge IPC)

  **References**:
  - `apps/desktop/src/main/sim/telemetry-recorder.ts` — Recorder to trigger
  - `apps/desktop/src/main/sim/sim-manager.ts` — Telemetry pipeline to pipe through recorder
  - `shared/types/bridge.ts` — IPC for start/stop recording
  - `apps/desktop/src/main/ipc/handlers.ts` — IPC handlers

  **Acceptance Criteria**:
  - [ ] `startRecording()` creates file at correct path with timestamp
  - [ ] `stopRecording()` closes file and returns path
  - [ ] `isRecording()` returns correct state
  - [ ] Recording state survives sim switches (stop recording before switch)
  - [ ] `pnpm typecheck` — 0 errors

  **QA Scenarios**:
  ```
  Scenario: Start and stop recording produces valid NDJSON file
    Tool: Bash
    Preconditions: Desktop app in dev mode with mock sim
    Steps:
      1. Call: window.vantare.startRecording() via bridge or test
      2. Wait 2 seconds (5-10 frames recorded)
      3. Call: window.vantare.stopRecording()
      4. Assert: returned file path exists
      5. Read file: first line is metadata JSON
      6. Read file: remaining lines are JSON telemetry frames
    Expected Result: Valid NDJSON file created with metadata + telemetry frames
    Evidence: .omo/evidence/sprint5a/task-10-recording.txt

  Scenario: Recording indicator shows recording state
    Tool: Playwright
    Steps:
      1. Navigate to localhost:5173
      2. Assert: recording indicator shows "Not recording"
      3. Start recording via IPC
      4. Assert: red dot + "Recording" visible
      5. Stop recording
      6. Assert: "Not recording" again
    Expected Result: Recording state indicator updates correctly
    Evidence: .omo/evidence/sprint5a/task-10-recording-indicator.png
  ```

  **Commit**: YES
  - Message: `feat(sim): recording trigger and manual recording control`
  - Files: `apps/desktop/src/main/sim/sim-manager.ts`, `apps/desktop/src/main/sim/telemetry-recorder.ts`
  - Pre-commit: `pnpm typecheck && pnpm test --filter=desktop`

- [ ] 11. Integration tests with recorded real data

  **What to do**:
  - Create test data flow:
    1. If real iRacing session available: record → save NDJSON as test fixture
    2. For CI: create synthetic NDJSON file with realistic telemetry data
    3. Test replay: load NDJSON → feed through iRacing adapter's parseSharedMemory → normalize → verify output matches expected
  - Create test files:
    - `apps/desktop/src/main/sim/__tests__/fixtures/iracing-recording.ndjson` — Pre-recorded or synthetic
    - `apps/desktop/src/main/sim/__tests__/iracing-integration.test.ts`
    - `apps/desktop/src/main/sim/__tests__/ac-integration.test.ts`
    - `packages/sim-core/src/replay/__tests__/replay-reader.test.ts`
  - Integration test patterns:
    - iRacing: feed recorded raw bytes → parseSharedMemory → normalize → assert specific field values
    - AC: feed simulated UDP packets → parseACPacket → normalize → assert
    - Replay: record → write → read back → byte-identical
    - SimManager: mock adapter → recording enabled → verify file created with correct frames

  **Must NOT do**:
  - No incluir datos reales de sesiones de iRacing en el repo (solo synthetic)
  - No subir archivos grandes (>1MB) al repo

  **Recommended Agent Profile**:
  > Tests de integración con datos grabados. Verificar pipelines completos.
  - **Category**: `unspecified-high`
    - Reason: Tests que ejercitan pipelines completos con datos realistas
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T4, T5, T6, T7)
  - **Parallel Group**: Wave 3
  - **Blocks**: None (final implementation task)
  - **Blocked By**: T4, T5 (adapter implementations), T6 (recording/replay), T7 (IPC)

  **References**:
  - `apps/desktop/src/main/sim/adapters/iracing-adapter.ts` — Parser to test
  - `apps/desktop/src/main/sim/adapters/ac-adapter.ts` — Parser to test
  - `packages/sim-core/src/replay/replay-reader.ts` — Reader to test
  - `packages/sim-core/src/normalizer.ts` — Normalizer to verify compatibility
  - `packages/sim-core/src/__tests__/normalizer.test.ts` — Existing test patterns
  - `apps/desktop/src/main/sim/sim-manager.ts` — Integration with recording

  **Acceptance Criteria**:
  - [ ] iRacing integration test: recorded data → parse → normalize → expected output
  - [ ] AC integration test: simulated UDP → parse → normalize → expected output
  - [ ] Replay integration test: write → read → byte-identical
  - [ ] SimManager recording test: recording produces correct file
  - [ ] All tests pass: `pnpm test --filter=desktop && pnpm test --filter=@vantare/sim-core`
  - [ ] `pnpm typecheck` — 0 errors

  **QA Scenarios**:
  ```
  Scenario: All integration tests pass
    Tool: Bash
    Preconditions: All Sprint 5a implementation tasks complete
    Steps:
      1. pnpm test --filter=@vantare/sim-core
      2. pnpm test --filter=desktop
      3. pnpm typecheck
    Expected Result: All tests pass, typecheck 0 errors
    Evidence: .omo/evidence/sprint5a/task-11-all-tests.txt

  Scenario: iRacing recorded data normalizes correctly
    Tool: Bash
    Steps:
      1. Record iRacing session (or use synthetic fixture)
      2. Run: pnpm test --filter=desktop -- --run src/main/sim/__tests__/iracing-integration.test.ts
      3. Check output: "✓ recorded data produces Telemetry with correct fields"
      4. Check output: "✓ player speed matches expected value from recording"
      5. Check output: "✓ lap data matches recording"
    Expected Result: All integration assertions pass
    Evidence: .omo/evidence/sprint5a/task-11-integration.txt
  ```

  **Commit**: YES (avec T4+T5+T6 — solo este commit si tasks previas no commitearon)
  - Message: `test(sim): integration tests with recorded real data`
  - Files: `apps/desktop/src/main/sim/__tests__/fixtures/*`, `apps/desktop/src/main/sim/__tests__/*integration*
  - Pre-commit: `pnpm typecheck && pnpm test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm typecheck` + linter + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/sprint5a/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `refactor(sim): move adapters to desktop/main, fix constants and UnmapViewOfFile bug`
- **T2**: `feat(sim): refactor SimManager with real adapter lifecycle (connect/poll/disconnect)`
- **T3**: `refactor(sim): barrel exports, delete old sim-core stubs`
- **T4**: `feat(sim): iRacing varHeader shared memory reader (koffi/FFI)`
- **T5**: `feat(sim): AC UDP handshaker protocol`
- **T6**: `feat(sim): NDJSON streaming recorder + replay reader`
- **T7**: `feat(ipc): bridge channels for inspector, recording, sim switching`
- **T8**: `feat(hub): Telemetry Inspector page + standalone overlay`
- **T9**: `feat(hub): sim switching UI in sidebar`
- **T10**: `feat(sim): recording trigger and manual recording control`
- **T11**: `test(sim): integration tests with recorded real data`

---

## Success Criteria

### Verification Commands
```bash
pnpm typecheck                          # 0 errors
pnpm test --filter=@vantare/sim-core    # all pass
pnpm test --filter=desktop              # all pass
pnpm lint                               # 0 warnings
pnpm build --filter=desktop             # build succeeds
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Typecheck: 0 errors
- [ ] Build: sucess
- [ ] Momus approved (if high accuracy mode)
