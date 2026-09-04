# ISA-894 · R7b/B1 — guardias RED de ausencia V1 frontend (fix tras re-review)

Fecha: 2026-09-04.
Rama: `vantareapp/isa-894-retirada-v1-r7b`. Cero cambios productivos:
este corte solo toca el guardia, su evidencia y el handoff.

## Guardia

`frontend/src/overlay/v1-retirement-b1.guard.test.ts` (13 tests): las
ausencias B2/B3 se ACUMULAN y se afirman juntas para que una ejecución
enumere TODOS los residuos con ruta+dueño (sin cortocircuito). Los
diferidos C2/D/E1/E2/E3 y el oráculo E4 se afirman PRESENTES (rojo si
alguien los borra antes de su corte). Exentos Strategy/Engineer/Analysis
v1: presentes por contrato, verde heredado de la suite A3, no reejecutado
en este corte.

## Inventario B0 → rutas exactas verificadas (13/13, sin divergencias)

| Grupo B0 | Ruta exacta | Dueño | Guardia |
|---|---|---|---|
| CompositeApp | `frontend/src/overlay/CompositeApp.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| ObsOverlayApp | `frontend/src/overlay/ObsOverlayApp.tsx` + `.test.tsx` | B2+C2 | presente (sin ancla inventada: no importa adapter V1 directo) |
| StudioRoute / studio-overlay-telemetry | `frontend/src/hub/overlay-studio/StudioRoute.tsx`, `studio-overlay-telemetry.ts` + tests | C2 | presente; sin imports B2 |
| telemetry-rate-coordinator + legacy | `frontend/src/overlay/core/telemetry-rate-coordinator.ts` + `.test.ts` (ancla real: `getFuelHistory`, `getInputHistory`, `getDeltaHistory`) | E1 | presente |
| overlay-wails-pull allowlist/counters | `frontend/src/telemetry-transport/overlay-wails-pull.ts` (`ALLOWED_EVENTS` + `receivedV1Projections`; anclas `telemetry:overlay:projection/status/fact`) + `.test.ts` | B2 | 4 anclas AUSENTES exigidas |
| authoring fixtures completos | `frontend/src/overlay/authoring/fixtures/` (`authoring-fixtures.ts`, `authoring-v2-fixture.ts`, `scene-interpolation`, `projection-gaps`, `animation-scenes` + tests) | C2 | presente; sin imports B2 |
| mock-scenarios | `frontend/src/overlay/core/mock-scenarios.ts` + `.test.ts` | E1 | presente |
| OverlayParityHarness | `frontend/src/overlay-harness/OverlayParityHarness.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| OverlayWorkshopDevRoute | `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| studio-v1-snapshot-test-harness | `frontend/src/hub/overlay-studio/canvas/fixtures/studio-v1-snapshot-test-harness.ts` (sin test propio en árbol) | E1 | presente |
| vite.config / index.html / overlay.html | `frontend/vite.config.ts`, `frontend/index.html`, `frontend/overlay.html` | E3 solo con refs (limpio) | sin refs V1 |
| scripts sesion-v1 | `scripts/bench/sesion-v1.ps1`, `sesion-v1-resumen.mjs`, `sesion-v1-resumen.test.mjs`, `sesion-v1-state.test.mjs` + refs en `all.test.mjs`/`README.md` | B3 | AUSENTES exigidos (6 anclas) |
| bench research frontend | `docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts`, `frontend-bench.mjs` | E3 | presente |
| (preservado E3) | `bench/compact_frame.go`: prototipo Go con tag `researchbench`, imports canónicos (derive/envelope), V1 solo en 2 comentarios, sin import `projection/overlay` | E3 | presente + anclas |

Núcleo B2: `overlay-projection-v1.*`, `overlay-projection-adapter.*`,
`transports/projection-telemetry-adapter.*`,
`transports/projection-observer.*` (+tests): AUSENTES exigidos (8 rutas).
`ProductID overlay`: superficie auditada exacta en `contracts.ts` — 2
anclas (`"overlay",` en `TELEMETRY_PRODUCTS` + alternativa
`(overlay|engineer|strategy|analysis)` en el regex de `eventName`);
`projectionRoute`/`factsRoute` son plantillas genéricas sin literal y
`effectiveMaximum` es genérico: necesarios, documentados, no vigilados.
Núcleo B3: `telemetry-shadow/overlay-v2-shadow-runtime.*`,
`overlay-v2-shadow-activation.*` (puerta `acceptLegacy`: expone
`acceptLegacy(epoch, sequence, snapshot: TelemetrySnapshot)` y crea el
runtime en el primer snapshot legacy — ingesta V1 del runtime, mismo
dueño B3 con prueba, sin STOP), `src/telemetry-cutover-runtime-harness/`,
`src/telemetry-overlay-shadow-harness/` (main, componente, test,
evidence), ambos HTML de harnesses, 2 playwright (`frontend/scripts/
telemetry-overlay-shadow.playwright.mjs`,
`telemetry-cutover-runtimes.playwright.mjs`: ejercitan los HTML B3 por
base URL, quedarían huérfanos sin ellos — dueño B3 con prueba).
Oráculo E4 explícitamente diferido (`overlay-shadow-comparator.ts`,
`overlay-shadow-sanitizer.ts` + tests: presentes, no error de B2/B3).
Lotes D COMPLETOS por ancla `buildViewModel` legacy (18/18 verificados):
D2 standings, relative, delta, fuel-strategy, pedals-telemetry,
input-telemetry; D3 racing-flags, delta-advanced, delta-trace, pedals,
pedals-telemetry-compact, multiclass-relative; D4 head-to-head, track-map,
broadcast-tower, track-weather, car-damage-numbers, car-damage-visual.
D5 `race-schedule`/`engineer-radio`: auxiliares con fuente propia, fuera
de los lotes, se conservan (presentes, no se retiran en D2–D4).
E2 por ancla `createOverlayV2FeaturesGeneration`. E1 suma
`telemetry-snapshot.ts`, `telemetry-adapter.ts` (transports y core),
`derived-telemetry-store.ts` + sus tests (sin fichero propio para el
acumulador de input: no se inventa ruta).
Hallazgo honesto del guardia (no divergencia STOP): 4 callers importan
módulos E1 — `StudioRoute.tsx` y `studio-overlay-telemetry.ts` →
`telemetry-adapter`; `authoring-fixtures.ts` y `authoring-v2-fixture.ts` →
`telemetry-snapshot`. Es la deuda que C2 migra y E1 retira según B0; el
guardia solo exige ausencia de módulos B2 en callers (verde).
Exentos: `strategy-contract-v1(.canonical).ts`, `engineer-types.ts`,
`AnalysisPayloadV1` en `generated/telemetry.ts`.

Divergencias STOP: ninguna. Todas las rutas B0 existen; ningún caller
productivo no inventariado apareció; la activación y los playwright van a
B3 con prueba citada, no a ciegas.

## RED literal

`pnpm --dir frontend test src/overlay/v1-retirement-b1.guard.test.ts` →
`Test Files 1 failed (1)` · `Tests 5 failed | 8 passed (13)`:
- B2 archivos (8 rutas: proyección/adapter/observer + tests).
- B2 ProductID (2 anclas `contracts.ts`: literal + regex).
- B2 wails-pull (4 anclas: 3 eventos + `receivedV1Projections`).
- B3 runtime/harness (17 rutas: runtime, activación, harnesses, 2 HTML,
  4 sesion-v1 y 2 playwright).
- B3 referencias (2 anclas sesion-v1 en `all.test.mjs`/`README.md`).
- 8 en verde: diferidos C2/D/E1/E2/E3/E4, callers sin imports B2, exentos,
  HTML limpios.

No se declara verde el suite: el rojo es el estado esperado de B1.
`git diff --check`: limpio. Rollback: revert del commit.
