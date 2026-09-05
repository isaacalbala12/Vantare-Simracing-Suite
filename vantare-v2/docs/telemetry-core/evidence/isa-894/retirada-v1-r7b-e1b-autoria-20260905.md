# ISA-894 R7b/E1b — autoría/Studio sin fixtures legacy (corte honesto mínimo)

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base E1b `ceff6697`.

## Alcance

Solo E1b. Sin E1c/E1d/E2+.

- Retirados del árbol:
  `frontend/src/overlay/authoring/fixtures/authoring-v2-scenario-widget.ts`
  y `frontend/src/hub/overlay-studio/canvas/fixtures/studio-v1-snapshot-test-harness.ts`.
- `authoring-v2-workshop-frame.ts` consolida la forma del widget
  (`buildScenarioWidgetShape`, local no exportada) desde el registro
  productivo; `createScenarioWidget` + `buildWorkshopFrameV2` son la
  frontera V2 final. Sin registro/adapter/DSL/fixture genérico nuevo y
  sin datos inventados (diseños por manifest, mismas dimensiones).
- `OverlayParityHarness.tsx` usa `createScenarioWidget` con `designId`;
  su test usa la misma frontera (throw ante variante desconocida real,
  dimensiones por manifest).
- Guard B1 actualizado en lo directo: el harness Studio sale de la
  lista de diferidos E1 presentes; Parity fija `createScenarioWidget`
  como lock E1b.
- D5 (Calendar/Engineer) y E4 (comparator/oráculo) intactos.

## Límite honesto (STOP aplicado, no ampliado)

- `authoring-fixtures.ts` (megamódulo) **no** se borra en este corte:
  `frontend/src/overlay/design-systems/vantare-endurance/contract.test.tsx`
  lo exige (5× `buildHarnessTelemetry` con variante multiclass +
  `buildStandingsViewModel`/`buildRelativeViewModel`/`buildTrackMapViewModel`
  legacy, dueños E1c). Migrarlo aquí invadiría E1c: STOP y se reporta.
- Los `import type { Mock*Scenario }` de Studio (`PreviewSourceControls`,
  `studio-context`, queries Workshop/Parity) siguen vivos: su retirada
  es dueña E1d (núcleo `mock-scenarios` + coordinador). No se tocan.
- `rg TelemetrySnapshot` en autoría/Studio aún cita el megamódulo
  (8 líneas) + un lock negativo de su propio test: deuda explícita
  E1c/E1d, no regresión E1b.

## TDD RED → GREEN

- RED `62a541b5`: `e1b-retirada.test.ts` 2 failed / 2
  (los dos módulos existían y los callers los importaban).
- GREEN `59c564a0` (borrado de los 2 ficheros) + `fd9d134e`
  (migración de callers + guard): el mismo focal pasa.

## Checks

- Focales E1b + Parity + Workshop/parity + escenas + gaps: 83/83 PASS.
- Revalidación sobre HEAD final (E1b + Parity + guard B1): 63/63 PASS.
- Guards B1 + E1a + autoridad: 25/25 PASS.
- `pnpm typecheck` (`tsc -b --noEmit`): verde.
- `pnpm build`: PASS (solo aviso preexistente de chunks > 500 kB).
- ESLint de los 5 ficheros tocados: limpio.
- `rg` ausencia: cero importadores productivos de los dos módulos
  (solo el propio test RED y un lock negativo del guard que exige
  ausencia en el fixture runtime).
- `git diff --check`: limpio.
- Suite completa no ejecutada; queda para E1d/F1.

## Riesgos

- Parity resuelve dimensiones vía manifest en vez del objeto
  `design` directo: idénticos números (misma fuente), verificado por
  el test de contrato Crystal 420×69.
- El throw ante variante inválida ahora se prueba con variante
  realmente desconocida (`pedals-full` es variante dev Workshop
  válida y mapea a `default`; no era el caso honesto para Parity).

## Siguiente

E1c (builders legacy por widget, incluido `contract.test.tsx`) y
E1d (núcleo `mock-scenarios`/coordinator + tipos Studio). Sin push,
PR, merge, promoción, apps ni LMU.
