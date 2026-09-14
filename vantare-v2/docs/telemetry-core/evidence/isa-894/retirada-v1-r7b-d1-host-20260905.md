# ISA-894 · R7b/D1 — WidgetVisualHost sin snapshot ni rama legacy (evidencia exacta)

Fecha: 2026-09-05. Rama única: `vantareapp/isa-894-retirada-v1-r7b`.
Base exacta: `030c7dc4c6c8fe2c649dd15f6bcde381704015dc` (limpia, verificada antes de empezar).
Commits locales D1 (sin push/PR/merge/promoción/apps/LMU, sin `.env*`):
`e92d58dc` (RED, solo test) + `556c68ed` (GREEN, Host + 4 tests/guardias).
Writer único. Ponytail `full` durante todo el corte.

## Inventario previo: cero callers productivos con snapshot (STOP no activado)

`rg "snapshot=\{" frontend/src` (todos los `.tsx`): solo 3 ficheros test usaban la
prop (`WidgetVisualHost.test.tsx`, `WidgetVisualHost.v2.test.tsx`,
`profile-contract-fixture.test.tsx`). Los 9 callers productivos del Host
(`RuntimeWidgetFrame`, `InPlaceWidgetEditFrame`, `StudioWidgetFrame`,
`OverlayWorkshopDevRoute`, `OverlayParityHarness`, `HomeMiniStage`,
`ProfilePreview`, `ui-orbit-harness`, más el mock de `StudioWidgetFrame.test`)
pasan solo `widget`/`renderMode`/`runtime`/`diagnostics`: ninguno necesita la
prop snapshot, la rama legacy ni el hack de input. No se reabre ni se adapta V1.

## TDD RED → GREEN literal

- RED (`e92d58dc`, nuevo `WidgetVisualHost.d1.test.tsx`, 23 tests): 22 passed /
  1 failed. El único fallo es estructural y exigido:
  `expect(source).not.toContain("TelemetrySnapshot")` contra el Host sin tocar.
  La parte conductual ya pasa en RED y fija el contrato: los 18 tipos del
  `overlayV2ViewModelRegistry` renderizan con frame+source canónicos
  (`buildAuthoringV2ScenarioRuntime`, golden de 20, sin sintéticos), exigen
  `overlay-v2-frame-missing` / `overlay-v2-source-missing` por separado, y
  `race-schedule` / `engineer-radio` siguen por sus canales auxiliares
  explícitos sin frame/source.
- GREEN (`556c68ed`): `WidgetVisualHost.tsx` +1/−20 neto. Salen la prop
  `snapshot?: TelemetrySnapshot`, su import, la rama
  `else if (harnessMode && snapshot)` con `buildPreview/Runtime/ViewModel` y
  `definition.buildViewModel`, y el hack `input-telemetry`
  (`recordInputTelemetrySample` + `readInputTelemetryHistory` + cast a
  `InputTelemetryViewModel`, con sus dos imports). El D1 queda 23/23.
  `WidgetTypeDefinition.buildViewModel` NO se toca (dueños D2/D3/D4);
  `v2Rollback` y sus gates NO se tocan (dueño E2); renderers, UX, sistemas y
  frontera única intactos; cero datos sintéticos o fallback.

## Ajustes estrictamente necesarios (mismo commit GREEN)

- `WidgetVisualHost.test.tsx`: pierde `buildMockTelemetry`/const; los 2 tests
  legacy pasan a frame V2 (`-0.420` Original / `-0.42` Crystal por
  `formatDeltaText` toFixed(3) vs barra toFixed(2), igualdad numérica intacta);
  el resto solo pierde la prop (el auxiliar y V2 ya la ignoraban); el helper
  local declara `history`/`requiredFuel`/`sessionLaps` como `missing` honesto.
- `WidgetVisualHost.v2.test.tsx`: pierde las 7 props snapshot + import/const
  (la ruta V2 ya las ignoraba).
- `profile-contract-fixture.test.tsx`: el render del Host usa runtime V2
  canónico; el assert directo a `definition.buildViewModel(snapshot, …)` queda
  intacto (definitions fuera de D1).
- `v1-authority-guard.test.ts`: sale la entrada `core/WidgetVisualHost.tsx` del
  baseline y el test de presencia pasa a ausencia (`not.toContain`
  `TelemetrySnapshot` / `harnessMode && snapshot`, `not.toMatch`
  `definition.buildViewModel(`).

## Gates literales (sobre `556c68ed`)

- Focales Host/guard (7 ficheros): **79 passed / 1 failed (80)**. El fallo es
  deuda heredada verificada en base `030c7dc4` antes de D1 (baseline 56/57 con
  el mismo fallo): `WidgetVisualHost.v2.test.tsx [fuel-strategy]` — su
  `makeFrame` manual no trae `requiredFuel` (contrato A2) y
  `displayedNumber(undefined)` revienta. Dueño del lote D2, no se toca en D1.
- Vecinos (Runtime/Studio/InPlaceEdit/rollback): **99/99**.
- `pnpm --dir frontend typecheck`: verde (exit 0).
- ESLint focal (6 ficheros del corte): limpio.
- `pnpm --dir frontend build`: PASS (aviso de chunks >500 kB preexistente).
- `git diff --check`: limpio.
- `rg` ausencia: Host sin `TelemetrySnapshot`/`snapshot`/`definition.buildViewModel`
  (solo `buildViewModelV2` del registro); cero `snapshot={` en todo `frontend/src`.
- Suite completa frontend NO ejecutada (solo focales + vecinos).

## No tocado / deuda

- `plan.md` / `roadmap.json`: sin tocar (deuda obligatoria del PR de código R7b
  según microplan F2; D1 no cambia entrega pública).
- Sin push, PR, merge, promoción, release, apps ni LMU. Sin revisión todavía:
  el orquestador revisará el diff (no hay APPROVE en este corte).
- Riesgo restante: el `makeFrame` manual de `WidgetVisualHost.v2.test.tsx`
  sigue desactualizado frente al contrato A2/A3 (falla 1 test heredado);
  lo resuelve el lote D2 al migrar `fuel-strategy`, no D1.
