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

## Inventario B0 → rutas exactas verificadas (15/15, corregido tras review adversarial)

| Grupo B0 | Ruta exacta | Dueño | Guardia |
|---|---|---|---|
| CompositeApp | `frontend/src/overlay/CompositeApp.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| ObsOverlayApp | `frontend/src/overlay/ObsOverlayApp.tsx` + `.test.tsx` | B2+C2 | presente (sin ancla inventada: no importa adapter V1 directo) |
| StudioRoute / OverlayStudioV3 / studio-overlay-telemetry / StudioTelemetryProvider | `frontend/src/hub/overlay-studio/StudioRoute.tsx`, `OverlayStudioV3.tsx`, `studio-overlay-telemetry.ts`, `canvas/StudioTelemetryProvider.tsx` + tests | C2 | RED: imports exactos de `transports/telemetry-adapter` y mock snapshot |
| telemetry-rate-coordinator + legacy | `frontend/src/overlay/core/telemetry-rate-coordinator.ts` + `.test.ts` (ancla real: `getFuelHistory`, `getInputHistory`, `getDeltaHistory`) | E1 | presente |
| overlay-wails-pull allowlist/counters | `frontend/src/telemetry-transport/overlay-wails-pull.ts` (`ALLOWED_EVENTS` + `receivedV1Projections`; anclas `telemetry:overlay:projection/status/fact`) + `.test.ts` | B2 | 4 anclas AUSENTES exigidas |
| fixture V2 de escenario + callers | nuevo `authoring-v2-scenario-fixture.ts`, previews/callers/dev harness y compat tests | C2 | RED: módulo puro ausente, callers snapshot y 2 tests que leen adapter B2 por ruta |
| helpers snapshot authoring + tests legacy | `authoring-fixtures.ts`, harness/contract/motion tests | D/E1 | PRESENTES hasta migrar definitions; no mover ni duplicar |
| previews Hub | `HomeMiniStage.tsx`, `ProfilePreview.tsx`, `ui-orbit-harness.tsx` | C2 | RED: prop snapshot V1 en Host |
| mock-scenarios | `frontend/src/overlay/core/mock-scenarios.ts` + `.test.ts` | E1 | presente |
| OverlayParityHarness | `frontend/src/overlay-harness/OverlayParityHarness.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| OverlayWorkshopDevRoute | `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx` + `.test.tsx` | C2 | presente; sin imports B2 |
| studio-v1-snapshot-test-harness | `frontend/src/hub/overlay-studio/canvas/fixtures/studio-v1-snapshot-test-harness.ts` (sin test propio en árbol) | E1 | presente |
| vite.config / index.html / overlay.html | `frontend/vite.config.ts`, `frontend/index.html`, `frontend/overlay.html` | E3 solo con refs (limpio) | sin refs V1 |
| runtime/harness/scripts sesion-v1 | runtime+activación, `overlay-shadow-lote2b-features.test.ts`, 2 packages harness, 2 HTML, 2 Playwright, `sesion-v1.ps1`, `sesion-v1-state.ps1`, `sesion-v1-resumen.mjs` + 2 tests, refs en `all.test.mjs`/README/`package.json`; helper histórico `s1-definitiva/recalcular.mjs` | B3 | 19 rutas AUSENTES + 6 refs activas AUSENTES; helper/README/hash PRESENTES |
| bench research frontend + prototipo Go preservado | `docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts`, `frontend-bench.mjs`, `compact_frame.go` (tag `researchbench`, imports canónicos; V1 solo en comentarios) | E3 | presentes + anclas |

Núcleo B2: `overlay-projection-v1.*`, `overlay-projection-adapter.*`,
`transports/projection-telemetry-adapter.*`,
`transports/projection-observer.*` (+tests): AUSENTES exigidos (8 rutas).
`ProductID overlay`: superficie auditada exacta — 5 anclas: 2 en
`contracts.ts` (`"overlay",` en `TELEMETRY_PRODUCTS` + alternativa
`(overlay|engineer|strategy|analysis)` en el regex de `eventName`) y 3 en
`projection-golden.test.ts` (golden Overlay, golden pre-D7 + caso pre-D7);
`projectionRoute`/`factsRoute` son plantillas genéricas sin literal y
`effectiveMaximum` es genérico: necesarios, documentados, no vigilados.
Núcleo B3 (19 rutas): `telemetry-shadow/overlay-v2-shadow-runtime.*`,
`overlay-v2-shadow-activation.*` (puerta `acceptLegacy`: expone
`acceptLegacy(epoch, sequence, snapshot: TelemetrySnapshot)` y crea el
runtime en el primer snapshot legacy — ingesta V1 del runtime, mismo
dueño B3 con prueba, sin STOP), `src/telemetry-cutover-runtime-harness/`,
`src/telemetry-overlay-shadow-harness/` (main, componente, test,
evidence), ambos HTML de harnesses, 2 playwright (`frontend/scripts/
telemetry-overlay-shadow.playwright.mjs`,
`telemetry-cutover-runtimes.playwright.mjs`: ejercitan los HTML B3 por
base URL, quedarían huérfanos sin ellos — dueño B3 con prueba), los cinco
ficheros `sesion-v1-*` y `overlay-shadow-lote2b-features.test.ts`. Las seis
referencias activas son los dos imports de `all.test.mjs`, README, dos scripts
de `package.json` y el import del resumen desde el recalculador S1. El helper
S1, su README y su hash se conservan; B3 lo desacopla del tooling retirado.
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
Además aparecieron tres previews Hub, `StudioTelemetryProvider` y, en la review
adversarial, `OverlayStudioV3`, el fixture authoring completo y el golden
pre-D7 fuera de las anclas iniciales. Todos quedan ahora con dueño explícito.
Orden corregido: `B1 → C2 → B3 → B2-prep → B2`. Tras el RED C2, un segundo
preflight cerró el grafo: el guard C2 enumera 31 anclas de callers; la pureza
del módulo nuevo queda en su focal semántico. El puente snapshot de
`authoring-v2-fixture.ts` pasa a B2 (9 rutas) y su único caller E4 se desacopla
en B2-prep (3 imports). Los helpers de `authoring-fixtures.ts` quedan D/E1.
Exentos: `strategy-contract-v1(.canonical).ts`, `engineer-types.ts`,
`AnalysisPayloadV1` en `generated/telemetry.ts`.

Divergencias STOP abiertas: ninguna después de corregir los cinco P1 de la
review adversarial (caller Studio, golden pre-D7, fixture completo, anclas
exactas y custodia S1).
No se inició B2 inseguro y no hubo cambios productivos.

## RED literal

`pnpm --dir frontend test -- src/overlay/v1-retirement-b1.guard.test.ts` →
`Test Files 1 failed (1)` · `Tests 7 failed | 8 passed (15)`:
- B2 archivos (9 rutas: proyección/adapter/observer + tests y puente snapshot E4).
- B2 ProductID/golden (5 anclas: 2 `contracts.ts` + 3 projection golden).
- B2 wails-pull (4 anclas: 3 eventos + `receivedV1Projections`).
- B3 runtime/harness/tooling (19 rutas; recalculador histórico preservado).
- B3 referencias activas (6 anclas, incluido el import del recalculador).
- B2-prep comparator/test (3 imports: tipos desde el adapter y puente snapshot E4).
- C2 callers/previews/fixtures (31 anclas).
- 8 en verde: diferidos D/E1/E2/E3/E4, callers sin imports B2, exentos y
  superficies preservadas.

No se declara verde el suite: el rojo es el estado esperado de B1.
`git diff --check`: limpio. Rollback: revert del commit.

## Review adversarial y corrección

- Spec review Muse `ses_f9295f…`: APPROVE sobre `d101e173`, P0/P1/P2=0.
- Quality review Muse `ses_f929493…`: REQUEST_CHANGES; encontró cinco huecos
  P1 antes de C2: `OverlayStudioV3`, golden `overlay_v1_pre_d7`, fixture
  authoring completo, anclas `TelemetryAdapter` demasiado nominales y custodia
  rota del recalculador S1.
- Corrección: todos quedan ahora en el guard/plan con rutas o especificadores
  exactos; el helper S1 se preserva y solo pierde su dependencia activa en B3.
  El focal conserva exactamente `7 failed | 8 passed (15)`, ahora con
  9 rutas + 9 anclas B2, 19 rutas + 6 refs B3, 3 imports B2-prep y 31 anclas C2.
- Re-review spec Muse `ses_f928d2…` sobre `fc0a4262`: APPROVE,
  P0/P1/P2=0; reejecutó focal, ESLint y diff-check.
- Re-review quality Muse `ses_f928adc…` sobre `fc0a4262`: APPROVE,
  P0/P1/P2=0; cerró uno a uno los cinco P1 y auditó falsos verdes/rojos,
  custodia S1 y riesgo de borrado.
- Estado: **B1 CERRADO con doble APPROVE fresco**; cero producción. Siguiente
  corte canónico: C2.

## Addendum C2 · preflight corregido tras el primer RED

El primer test RED de C2 (`b72af09d`) reveló que el puente
`authoring-v2-fixture.ts` todavía es necesario para el oráculo E4 y que los
helpers snapshot de `authoring-fixtures.ts` tienen consumidores de definitions
fuera de C2. Se abortó sin commit el intento de trasladar esos helpers a otro
módulo legacy.

Contrato corregido, aún sin producción:
- C2 crea `authoring-v2-scenario-fixture.ts` desde el golden V2 canónico y
  migra los callers/previews/compatibilidad por subcortes C2a/C2b/C2c.
- `authoring-fixtures.ts` permanece bajo D/E1; no se mueve ni duplica.
- el puente snapshot actual permanece solo para E4; B2-prep desacopla su único
  caller y B2 lo elimina.
- el guard declara 31 anclas C2 de callers; 30 siguen activas porque el propio
  test RED ya importa el futuro API puro. Las prohibiciones internas del módulo
  viven solo en el focal, evitando siete falsos fallos repetidos por fichero
  todavía ausente.

El review de calidad posterior añadió anclas para los builders snapshot de
Parity, Workshop, sus tests y previews Hub; corrigió el comentario de dueño
D/E1 y cerró la semilla con golden 20, igualdad completa del escenario default,
`trackName`, relative canónico y mutación acotada de multiclass.

Reproducción: guard `7 failed | 8 passed (15)` y test focal C2 falla al resolver
`./authoring-v2-scenario-fixture`, exactamente antes de C2a. Este addendum y el
plan corregido quedaron cerrados en HEAD `5b254087` con doble revisión fresca:
- spec Muse `ses_f92712299ffeGIc4JPPXEs97MN`: **APPROVE**, P0/P1/P2=0;
- quality Muse `ses_f926b66f5ffe1QN1JaDlihRZbW`: **APPROVE**, P0/P1/P2=0.

Ambas revisiones verificaron el árbol limpio, las 31 anclas C2 declaradas
(30 activas), las 8 anclas nuevas contra callers reales, la semilla exacta
`overlay_v2_20.golden.json`, los 15 grupos B0 y el orden
`B1 → C2 → B3 → B2-prep → B2`. C2a puede reanudarse con el mismo writer y
alcance limitado al nuevo fixture V2 puro.

## C2a ejecutado — fixture V2 puro de escenario (ISA-894)

Rama `vantareapp/isa-894-retirada-v1-r7b`, base `41c584a7`, commit de código
`50c5f8f6` (un fichero, +65): `authoring-v2-scenario-fixture.ts`.
TDD RED→GREEN literal: RED = el focal no resolvía el import del módulo
inexistente; GREEN = 7/7 en
`frontend/src/overlay/authoring/fixtures/authoring-v2-scenario-fixture.test.ts`
(contrato del preflight, sin tocar). Checks: ESLint focal limpio en módulo y
test; `git diff --check` limpio; typecheck con los 8 heredados R7a exactos en
sus 3 módulos y cero nuevos (dos errores propios intermedios por `readonly`/
`null` se corrigieron con spread antes del commit); build no ejecutado por el
mismo bloqueo preexistente. Sin push/PR/merge/promoción/apps/LMU. C2 sigue
abierto: C2b migrará callers/previews/compat; el RED pendiente real son las 30
anclas C2 del guard más compat tests.

## C2a post-review — cierres P3 de pureza (ISA-894)

Revisión spec Muse `ses_f925a2447ffecpXMuKkjuSaKaN`: **APPROVE**, P0/P1/P2=0,
7 P3. Cierres aplicados (sin entrar en C2b): tipo local estrecho
`AuthoringV2Variant` (`"default" | "standings-multiclass"`, ya sin importar
`HarnessVariant`; variante desconocida lanza en vez de no-op silencioso),
fail-fast en carga si el golden carece de frame/source/standings (cero
fallbacks `undefined`/`[]`), focal a 9/9 (los 7 intactos + identidad distinta
de clones y aislamiento ante mutaciones). Correcciones de docs:
session/location/widget/system son los 4 reservados (state/variant sí se
especializan); "cero shadow-runtime V1"; el RED pendiente son las 30 anclas C2
del guard + compat (el `authoring-v2-fixture.test.ts` del primer RED ya no
existe). P3 no aplicado a propósito: singleton `PREVIEW_V2_RUNTIME` — C2b
decidirá factory/ownership con consumidores reales; queda como riesgo C2b.
Guard tras C2a: `7 failed | 8 passed (15)` (grupo C2 en rojo, resto igual).

## C2a quality review — corrección P2+P3 (ISA-894)

Revisión quality Muse `ses_f92522698ffeDQwN643LThbEoz` sobre `608161eb`:
**REQUEST_CHANGES**, P2=2. Corrección en commit `fdb1130d` (módulo+focal):
P2-1, `scenarioStandings` se comparaba contra `rows` (tautología) — ahora
contra `canonicalStandings`; P2-2, aislamiento profundo real — `not.toBe` de
session/relative/player/standings contra el canónico, mutación tipada de
`session.track.v`, `player.id`, `relative[0].name` con cast explícito a mutable
solo en el test, segunda invocación igual al canónico; focal 9/9 con los 7
previos intactos. P3: fail-fast extendido a `player.id`, `session.track` y
relative con side/authority (exigidos, no sintetizados); independencia =
valores runtime/bundle (cero imports de `authoring-fixtures.ts`, ni `type`).
Riesgos C2b sin optimizar: singleton `PREVIEW_V2_RUNTIME` y tamaño bundle del
golden `?raw` (~33,5 KB medidos). Guard tras la corrección:
`7 failed | 8 passed (15)`; typecheck con los 8 heredados exactos, cero
nuevos; ESLint y `diff --check` limpios. HEAD tras la corrección: `fdb1130d`
(código+focal); este registro se cierra en el commit documental siguiente.

Re-review quality Muse `ses_f92522698ffeDQwN643LThbEoz` sobre `6c4ead7f`:
**APPROVE**, P0/P1/P2=0. Reprodujo focal 9/9, guard
`7 failed | 8 passed (15)` con 30 anclas C2 activas, ESLint, diff-check y los
8 errores typecheck heredados sin errores nuevos. C2a queda **CERRADO**.
Dos P3 no bloqueantes pasan con dueño explícito a C2b: aislamiento cruzado
específico del array `standings` y decisión factory/ownership del singleton
preview junto con la medición del coste de inlining del golden.

## C2b preflight — 30 anclas divididas por superficie (ISA-894)

Auditoría read-only Muse `ses_f9245f094ffew97dEQcTBvLIio` verificó las 30
anclas activas y sus callers. El orden corregido queda:
`C2b0 Studio type 30→26`, `C2b1 Composite 26→24`, `C2b2 Studio test 24→23`,
`C2b3 Hub previews 23→17`, `C2b4 Studio provider 17→15`,
`C2b5 Parity/responsive 15→10`, `C2b6 Workshop/compat 10→2` y
`C2b7 gaps/scenes 2→0`. El descenso es criterio de aceptación, no estimación:
si un corte no cierra sus anclas, permanece abierto.

La contradicción principal era propiedad de tipos: cuatro imports Studio
apuntan al módulo E1 aunque no cargan V1 en runtime. C2b0 los reubica mediante
tipo inferido en `studio-overlay-telemetry.ts`, sin interfaz/archivo nuevo ni
cambio de conducta. Histories, seeds, variantes, scenes y gaps quedan sujetos
a productor V2 demostrable; si falta, STOP/defer con dueño, nunca dato
sintético o degradación silenciosa. El microplan actualizado requiere doble
review antes de escribir C2b0.
