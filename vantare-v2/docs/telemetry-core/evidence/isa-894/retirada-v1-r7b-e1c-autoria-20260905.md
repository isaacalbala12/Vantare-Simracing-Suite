# ISA-894 R7b/E1c — megamódulo de autoría fuera, contract sobre frame V2

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base E1c `141592cd`.

## Alcance (corregido, sin builders)

Solo E1c según el orden efectivo de `141592cd`: cae únicamente la
autoría legacy. Los 16 builders `*-view-model.ts` quedan intactos para
E4 (el comparator los importa como oráculo) y el núcleo snapshot para
E1d. Sin E2+, apps, LMU, browser, benchmark, secretos, push, PR, merge,
promoción ni release.

- Borrados del árbol (4 ficheros, cero callers productivos restantes):
  - `frontend/src/overlay/authoring/fixtures/authoring-fixtures.ts`
    (megamódulo snapshot, ~800 líneas).
  - `frontend/src/overlay/authoring/fixtures/authoring-fixtures.test.ts`
    (test exclusivo V1).
  - `frontend/src/overlay-harness/harness-fixtures.ts` (shim de
    re-export sin callers productivos; su único importador era su test).
  - `frontend/src/overlay-harness/harness-fixtures.test.ts` (test
    exclusivo V1; la cobertura V2 vive en
    `authoring-v2-scenario-fixture.test.ts` y
    `workshop-runtime-parity.test.tsx`, no se duplica).
- Conservado como único helper V2 de Workshop/Parity:
  `authoring-v2-scenario-widget.ts` (frontera mínima usada por Parity vía
  `buildAuthoringV2ScenarioWidget` y por Workshop vía
  `createScenarioWidget`). Se retira su comentario rancio que lo mandaba
  a borrar con el megamódulo, igual que el de
  `authoring-v2-workshop-frame.ts`.
- Migrado el único caller legítimo con snapshot:
  `design-systems/vantare-endurance/contract.test.tsx` (5 tests
  multiclass). El modelo ya no se construye con
  `buildHarnessTelemetry` + builder snapshot, sino con
  `buildAuthoringV2ScenarioRuntime` (variante `standings-multiclass`,
  shape-only sobre el golden de 20) + `buildStandingsViewModelV2`, y el
  caso de densidad con `buildWorkshopFrameV2` (`standings-stress60`,
  60 filas). Misma semántica de renderer, datos canónicos: bloques
  `[lmp2, gte, hypercar]` (jugador vehicle-000 en hypercar), jugador
  re-mapeado a `Driver 001` (lmp2) para el orden con clase al fondo,
  códigos F1 numéricos del golden (`/^[A-Z0-9]{3}$/`), tope WEC 8 con
  jugador fuera de corte en la 21 de hypercar. Sin copiar funciones, sin
  adapter/registro/factory/DSL nuevos, sin datos inventados.
- Guard B1: nuevo lock E1c de ausencia (4 rutas + 2 anclas en contract);
  salen las presencias del megamódulo (diferidos C2, loop de callers,
  tests exactos y anclas `TelemetrySnapshot`/`buildMockTelemetry`, que
  leían el fichero borrado). Comparator/builders/E1d intactos.

## Trazabilidad previa (inventario)

`rg authoring-fixtures` solo halló el shim, su test, el test exclusivo
y el contract; Parity/Workshop/queries ya estaban en V2 (locks
C2b5a/C2b6b/C2b6c). `rg TelemetrySnapshot` bajo `authoring/` +
`overlay-harness/` solo deja el lock negativo de
`authoring-v2-scenario-fixture.test.ts`. STOP no activado: el contract
tenía equivalente V2 ya existente (frame canónico + builder V2).

## TDD RED → GREEN

- RED `f8ee3f74`: lock E1c 1 failed (enumera los 4 ficheros).
- GREEN `d5a34a16`: +69/−1244 (neto −1175), borrado + migración +
  guard. El contract pasa 17/17 a la primera contra datos canónicos.

## Checks (sobre `d5a34a16`)

- Focales guard + contract + authoring + harness: 15 ficheros, 176/176 PASS.
- Vecinos core + comparator + standings + relative: 42 ficheros, 411/411 PASS.
- `pnpm typecheck` (`tsc -b --noEmit`): verde.
- `pnpm build`: PASS (solo avisos preexistentes de chunks).
- ESLint de los 4 ficheros tocados vivos: limpio.
- `rg` ausencia megamódulo/shim/`buildHarnessTelemetry` en `frontend/src`:
  limpio salvo locks del guard y `ui-orbit-harness-fixtures` (otro módulo).
- `rg TelemetrySnapshot` bajo authoring/overlay-harness: solo lock negativo.
- `git diff --check`: limpio.
- Suite completa no ejecutada; queda para E1d/F1.

## Siguiente

E2 (switch mutable) según el orden efectivo. Sin push, PR, merge,
promoción, apps ni LMU.
