# ISA-894 · R7b/B1 — guardias RED de ausencia V1 frontend

Fecha: 2026-09-04.
Rama: `vantareapp/isa-894-retirada-v1-r7b`. Cero cambios productivos:
este corte solo añade el guardia, su evidencia y el handoff.

## Guardia

`frontend/src/overlay/v1-retirement-b1.guard.test.ts` (9 tests): los lotes
B2/B3 se afirman AUSENTES (rojo mientras existan); los diferidos
C2/D/E1/E2/E3 y el oráculo E4 se afirman PRESENTES (rojo si alguien los
borra antes de su corte); los exentos Strategy/Engineer/Analysis v1 se
afirman presentes por contrato independiente; `vite.config.ts`/`index.html`/
`overlay.html` se afirman sin refs V1 (limpio en B0 y ahora).

## Inventario B0 → rutas exactas verificadas (13/13, sin divergencias)

| Grupo B0 | Ruta exacta | Dueño | Guardia |
|---|---|---|---|
| CompositeApp | `frontend/src/overlay/CompositeApp.tsx` (+test) | C2 | presente |
| ObsOverlayApp | `frontend/src/overlay/ObsOverlayApp.tsx` (+test) | B2+C2 | presente (sin ancla inventada: no importa adapter V1 directo) |
| StudioRoute / studio-overlay-telemetry | `frontend/src/hub/overlay-studio/StudioRoute.tsx`, `studio-overlay-telemetry.ts` (+tests) | C2 | presente |
| telemetry-rate-coordinator + legacy | `frontend/src/overlay/core/telemetry-rate-coordinator.ts` (+test) | E1 | presente |
| overlay-wails-pull allowlist/counters | `frontend/src/telemetry-transport/overlay-wails-pull.ts` (`ALLOWED_EVENTS` con `telemetry:overlay:projection`) | B2 | ancla V1 AUSENTE exigida |
| authoring fixtures completos | `frontend/src/overlay/authoring/fixtures/authoring-fixtures.ts`, `authoring-v2-fixture.ts` | C2 | presente |
| mock-scenarios | `frontend/src/overlay/core/mock-scenarios.ts` | E1 | presente |
| OverlayParityHarness | `frontend/src/overlay-harness/OverlayParityHarness.tsx` (+test) | C2 | presente |
| OverlayWorkshopDevRoute | `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx` (+test) | C2 | presente |
| studio-v1-snapshot-test-harness | `frontend/src/hub/overlay-studio/canvas/fixtures/studio-v1-snapshot-test-harness.ts` | E1 | presente |
| vite.config / index.html / overlay.html | `frontend/vite.config.ts`, `frontend/index.html`, `frontend/overlay.html` | E3 solo con refs (limpio) | sin refs V1 |
| scripts sesion-v1 | `scripts/bench/sesion-v1.ps1`, `sesion-v1-resumen.mjs`, `sesion-v1-resumen.test.mjs`, `sesion-v1-state.test.mjs` + refs en `all.test.mjs`/`README.md` | B3 | AUSENTES exigidos |
| bench research frontend | `docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts`, `frontend-bench.mjs` (`compact_frame.go` se preserva) | E3 | presente |

Núcleo B2 adicional: `overlay-projection-v1.*`, `overlay-projection-adapter.*`,
`transports/projection-telemetry-adapter.*`, `transports/projection-observer.*`
(+tests), `ProductID overlay` en `contracts.ts`, eventos V1 en allowlist.
Núcleo B3 adicional: `telemetry-shadow/overlay-v2-shadow-runtime.*`,
`src/telemetry-cutover-runtime-harness/main.ts`,
`src/telemetry-overlay-shadow-harness/` (main, componente, test, evidence),
HTML de harnesses referenciados. Oráculo E4 explícitamente diferido
(`overlay-shadow-comparator.ts`, `overlay-shadow-sanitizer.ts` + tests:
presentes, no error de B2/B3). Lotes D por ancla `buildViewModel` legacy
(standings D2, delta-trace D3, head-to-head D4). E2 por ancla
`createOverlayV2FeaturesGeneration`. E1 suma `telemetry-snapshot.ts`,
`telemetry-adapter.ts` (transports y core) y `derived-telemetry-store.ts`
(sin fichero propio para el acumulador de input: no se inventa ruta).
Exentos: `strategy-contract-v1(.canonical).ts`, `engineer-types.ts`,
`AnalysisPayloadV1` en `generated/telemetry.ts` (suite completa: verdes).

Divergencias: ninguna. Todas las rutas B0 existen; ningún caller productivo
no inventariado apareció en el inventario.

## RED literal

`pnpm --dir frontend test src/overlay/v1-retirement-b1.guard.test.ts` →
`Test Files 1 failed (1)` · `Tests 2 failed | 7 passed (9)`:
- `× B2: …` — `overlay-projection-v1.ts todavía existe: resto V1
  productivo, dueño B2`.
- `× B3: …` — `overlay-v2-shadow-runtime.ts todavía existe: resto V1
  productivo, dueño B3`.
- 7 en verde: diferidos C2/D/E1/E2/E3/E4, exentos y HTML limpios.

No se declara verde el suite: el rojo es el estado esperado de B1.
`git diff --check`: limpio. Rollback: revert del commit.
