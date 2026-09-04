# ISA-894 · R7b/B1 — guardias RED de ausencia V1 frontend (corregido tras preflight B2)

Fecha: 2026-09-04.
Rama: `vantareapp/isa-894-retirada-v1-r7b`. Cero cambios productivos:
este corte solo toca el guardia, su evidencia y el handoff.

## Guardia

`frontend/src/overlay/v1-retirement-b1.guard.test.ts` (15 tests): las
ausencias B2/B3 se ACUMULAN y se afirman juntas para que una ejecución
enumere TODOS los residuos con ruta+dueño (sin cortocircuito). Los
diferidos D/E1/E2/E3 y el oráculo E4 se afirman PRESENTES (rojo si
alguien los borra antes de su corte). Exentos Strategy/Engineer/Analysis
v1: presentes por contrato, verde heredado de la suite A3, no reejecutado
en este corte. C2 ya es RED explícito porque debe ejecutarse antes de B3/B2.

## Inventario B0 → rutas exactas verificadas (14/14, sin divergencias tras reclasificar)

| Grupo B0 | Ruta exacta | Dueño | Guardia |
|---|---|---|---|
| CompositeApp | `frontend/src/overlay/CompositeApp.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| ObsOverlayApp | `frontend/src/overlay/ObsOverlayApp.tsx` + `.test.tsx` | B2+C2 | presente (sin ancla inventada: no importa adapter V1 directo) |
| StudioRoute / studio-overlay-telemetry / StudioTelemetryProvider | `frontend/src/hub/overlay-studio/StudioRoute.tsx`, `studio-overlay-telemetry.ts`, `canvas/StudioTelemetryProvider.tsx` + tests | C2 | RED: `TelemetryAdapter` y mock snapshot |
| telemetry-rate-coordinator + legacy | `frontend/src/overlay/core/telemetry-rate-coordinator.ts` + `.test.ts` (ancla real: `getFuelHistory`, `getInputHistory`, `getDeltaHistory`) | E1 | presente |
| overlay-wails-pull allowlist/counters | `frontend/src/telemetry-transport/overlay-wails-pull.ts` (`ALLOWED_EVENTS` + `receivedV1Projections`; anclas `telemetry:overlay:projection/status/fact`) + `.test.ts` | B2 | 4 anclas AUSENTES exigidas |
| authoring fixtures completos | `frontend/src/overlay/authoring/fixtures/` (`authoring-fixtures.ts`, `authoring-v2-fixture.ts`, `scene-interpolation`, `projection-gaps`, `animation-scenes` + tests) | C2 | RED: wrapper snapshot y 2 tests que leen adapter B2 por ruta |
| previews Hub | `HomeMiniStage.tsx`, `ProfilePreview.tsx`, `ui-orbit-harness.tsx` | C2 | RED: prop snapshot V1 en Host |
| mock-scenarios | `frontend/src/overlay/core/mock-scenarios.ts` + `.test.ts` | E1 | presente |
| OverlayParityHarness | `frontend/src/overlay-harness/OverlayParityHarness.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| OverlayWorkshopDevRoute | `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| studio-v1-snapshot-test-harness | `frontend/src/hub/overlay-studio/canvas/fixtures/studio-v1-snapshot-test-harness.ts` (sin test propio en árbol) | E1 | presente |
| vite.config / index.html / overlay.html | `frontend/vite.config.ts`, `frontend/index.html`, `frontend/overlay.html` | E3 solo con refs (limpio) | sin refs V1 |
| runtime/harness/scripts sesion-v1 | runtime+activación, `overlay-shadow-lote2b-features.test.ts`, 2 packages harness, 2 HTML, 2 Playwright, `sesion-v1.ps1`, `sesion-v1-state.ps1`, `sesion-v1-resumen.mjs` + 2 tests, helper `s1-definitiva/recalcular.mjs`, refs en `all.test.mjs`/README/`package.json` | B3 | AUSENTES exigidos (20 rutas + 5 refs) |
| bench research frontend | `docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts`, `frontend-bench.mjs` | E3 | presente |
| (preservado E3) | `bench/compact_frame.go`: prototipo Go con tag `researchbench`, imports canónicos (derive/envelope), V1 solo en 2 comentarios, sin import `projection/overlay` | E3 | presente + anclas |

Núcleo B2: `overlay-projection-v1.*`, `overlay-projection-adapter.*`,
`transports/projection-telemetry-adapter.*`,
`transports/projection-observer.*` (+tests): AUSENTES exigidos (8 rutas).
`ProductID overlay`: superficie auditada exacta — 4 anclas: 2 en
`contracts.ts` (`"overlay",` en `TELEMETRY_PRODUCTS` + alternativa
`(overlay|engineer|strategy|analysis)` en el regex de `eventName`) y 2 en
`projection-golden.test.ts` (golden Overlay + caso pre-D7);
`projectionRoute`/`factsRoute` son plantillas genéricas sin literal y
`effectiveMaximum` es genérico: necesarios, documentados, no vigilados.
Núcleo B3 (20 rutas): `telemetry-shadow/overlay-v2-shadow-runtime.*`,
`overlay-v2-shadow-activation.*` (puerta `acceptLegacy`: expone
`acceptLegacy(epoch, sequence, snapshot: TelemetrySnapshot)` y crea el
runtime en el primer snapshot legacy — ingesta V1 del runtime, mismo
dueño B3 con prueba, sin STOP), `src/telemetry-cutover-runtime-harness/`,
`src/telemetry-overlay-shadow-harness/` (main, componente, test,
evidence), ambos HTML de harnesses, 2 playwright (`frontend/scripts/
telemetry-overlay-shadow.playwright.mjs`,
`telemetry-cutover-runtimes.playwright.mjs`: ejercitan los HTML B3 por
base URL, quedarían huérfanos sin ellos — dueño B3 con prueba), los cinco
ficheros `sesion-v1-*`, `overlay-shadow-lote2b-features.test.ts` y el helper
ejecutable `s1-definitiva/recalcular.mjs`. Las cinco referencias activas son
los dos imports de `all.test.mjs`, README y dos scripts de `package.json`.
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
Hallazgo honesto del preflight: B2 directo no era seguro. Comparator E4
importa tipos del adapter; dos tests C2 leen ese adapter por ruta; los
harnesses B3 importan módulos B2; `v1-authority-guard.test.ts` los baselinea.
Además aparecieron tres previews Hub y `StudioTelemetryProvider` fuera de la
tabla inicial. Todos quedan ahora con dueño explícito. Orden corregido:
`B1 → C2 → B3 → B2-prep → B2`. El guard C2 enumera 15 anclas actuales.
Exentos: `strategy-contract-v1(.canonical).ts`, `engineer-types.ts`,
`AnalysisPayloadV1` en `generated/telemetry.ts`.

Divergencias STOP abiertas: ninguna después de corregir el plan y el guard.
No se inició B2 inseguro y no hubo cambios productivos.

## RED literal

`pnpm --dir frontend test -- src/overlay/v1-retirement-b1.guard.test.ts` →
`Test Files 1 failed (1)` · `Tests 7 failed | 8 passed (15)`:
- B2 archivos (8 rutas: proyección/adapter/observer + tests).
- B2 ProductID/golden (4 anclas: 2 `contracts.ts` + 2 projection golden).
- B2 wails-pull (4 anclas: 3 eventos + `receivedV1Projections`).
- B3 runtime/harness/tooling (20 rutas).
- B3 referencias activas (5 anclas).
- B2-prep comparator/test (2 imports de tipos desde el adapter).
- C2 callers/previews/fixtures (15 anclas).
- 8 en verde: diferidos D/E1/E2/E3/E4, callers sin imports B2, exentos y
  superficies preservadas.

No se declara verde el suite: el rojo es el estado esperado de B1.
`git diff --check`: limpio. Rollback: revert del commit.
