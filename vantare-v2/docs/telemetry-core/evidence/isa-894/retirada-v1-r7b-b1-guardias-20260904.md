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

## C2b0 ejecutado — reclasificación tipos Studio (ISA-894)

Base `a32c18cb`, commit de test/gobernanza `9e7cf552` (cero producción).
Baseline literal previo: guard `7 failed | 8 passed (15)`, C2 con 30 anclas
(4 con `transports/telemetry-adapter`). Cambio: retiradas del bloque C2 esas
4 entradas (`StudioRoute`, `OverlayStudioV3`, `studio-overlay-telemetry`,
`StudioTelemetryProvider`) por false-positive probado (`import type` bajo
ownership E1, sin V1 en runtime/bundle); comentario mínimo en el guard.
Resultado literal: guard deliberadamente RED `7 failed | 8 passed (15)`, C2
con **26 anclas** exactas y cero menciones a `transports/telemetry-adapter`
dentro de las anclas negativas C2 (las dos menciones
`overlay-projection-adapter` siguen C2b7). ESLint focal y
`git diff --check` limpios; typecheck con los 8 heredados R7a (no verde);
build no ejecutado. El guard global NO está verde. Siguiente: C2b1 26→24.

## C2b0 APROBADO final (ISA-894)

Spec final Muse `ses_f921b746cffeVYW5VLt14SAKGY`: **APPROVE**,
P0=0 P1=0 P2=0 (P3 informativo). Quality final Muse
`ses_f921f9197ffe7ax5CGD6KkQOMb`: **APPROVE**, P0=P1=P2=P3=0. Estado literal
tras el cierre: guard deliberadamente RED `7 failed | 8 passed (15)` con C2
en 26 anclas activas; typecheck NO verde con los 8 errores heredados R7a;
build no ejecutado. Siguiente: C2b1 26→24. (Histórico C2a: el baseline previo
a C2b0 era de 30 anclas activas.)

## C2b0 quality REQUEST_CHANGES — endurecimiento (ISA-894)

Quality review Muse `ses_f92271085ffeQRY7qOv1BrisR0` sobre `276ab8e4`:
**REQUEST_CHANGES** (la spec anterior hizo timeout: sin veredicto). Fixes en
commit `c0745202`: las 4 falsas alarmas siguen fuera de `contentAbsentAll`;
comprobación positiva mínima y exacta dentro del mismo test C2 (sin tests
nuevos, 15 intactos) de `import type { TelemetryAdapter }` + módulo canónico
en las 4 rutas (owner E1); `StudioTelemetryProvider.tsx` en el loop
sin-imports-V1. Metodología: 31 declaradas/30 activas antes, 27 declaradas/26
activas después; la secuencia es de ACTIVAS y coincide con el Vitest
`expected …(26)`. Frase corregida: cero menciones a
`transports/telemetry-adapter` dentro de las anclas negativas C2 (las dos
`overlay-projection-adapter` siguen C2b7). Guard: `7 failed | 8 passed (15)`;
ESLint, `diff --check` y typecheck (8 heredados) sin regresión. Pendiente:
nueva spec+quality.

## C2b1 ejecutado — CompositeApp test V2-only (ISA-894)

Base `08c660e5`, commit de test `5a99fa14` (cero producción). Anclas activas
C2 identificadas antes de editar (2, ambas en `CompositeApp.test.tsx`):
`overlay_v1.golden.json?raw` (línea 10, alimentaba `canonicalEnvelope`) y
`overlay-v2-shadow-runtime` (línea 28, `vi.mock` + mock). Migración con
intención R2 preservada: `legacyV1Envelope()` inline mínimo para la sonda
negativa (el pull ignora V1; payload `{}` irrelevante, no fixture), asserts
vacuos del mock eliminado sustituidos por render V2 + diagnóstico sin
`shadow`; la cobertura del snapshot V2 real (`overlay_v2_1.golden.json`,
`Driver 000`, cierre del pull en unmount) queda intacta. Barrido literal del
fichero sin restos (lista de 13 patrones del alcance, cero coincidencias).
Focal: `pnpm --dir frontend test -- src/overlay/CompositeApp.test.tsx` →
`17 passed (17)` (baseline previo 17/17). Guard:
`pnpm --dir frontend test -- src/overlay/v1-retirement-b1.guard.test.ts` →
`7 failed | 8 passed (15)` con 24 anclas C2 (25 declaradas, una inactiva
heredada de C2a). ESLint de ambos TS tocados limpio; `git diff --check`
limpio; `pnpm --dir frontend typecheck` con los 8 heredados exactos y cero
nuevos (no verde); build no ejecutado. Siguiente: C2b2 24→23.

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

La contradicción principal era propiedad de tipos: cuatro imports Studio son
`import type` del módulo E1 (`overlay/transports/telemetry-adapter.ts`) y no
cargan V1 en runtime ni entran al bundle. C2b0 NO los mueve ni duplica:
corrige/reclasifica esas cuatro entradas false-positive del guard y mantiene
el tipo canónico hasta E1 o un refactor neutral futuro. Además se detectó el
import colgado de `StudioTelemetryProvider.test.tsx` desde
`overlay/transports/wails-telemetry-adapter` (inexistente): C2b4 lo corrige
al tipo canónico real, sin presentarlo como V1 runtime. La factory por
consumidor (aislamiento de `standings`) se añade/resuelve en C2b3, no en C2a,
y el bundle queda no evaluable hasta desbloquear los 8 errores R7a.

## C2b corrección tras doble REQUEST_CHANGES (ISA-894, solo docs)

Spec review Muse `ses_f9240634bffeNNMnf3wHltlOI6`: **REQUEST_CHANGES**.
Quality review Muse `ses_f923cf6acffeSiLRo6Z3APoEit`: **REQUEST_CHANGES**.
Cero código tocado; este commit solo corrige los tres documentos
(microplan, evidencia, handoff).

Hallazgos aplicados:

1. C2b0 NO mueve ni duplica `TelemetryAdapter`. Los cuatro imports Studio
   son type-only (no V1 runtime ni bundle). 30→26 = quitar esas cuatro
   anclas false-positive del guard, manteniendo el tipo canónico hasta E1
   o refactor neutral futuro; nada de `ReturnType` inferido ni re-export.
2. `StudioTelemetryProvider.test.tsx` importa el tipo desde
   `overlay/transports/wails-telemetry-adapter`, ruta inexistente en árbol.
   C2b4 la corrige al tipo canónico real, sin presentarla como V1 runtime.
3. La factory por consumidor y el aislamiento cruzado de `standings` se
   añaden/resuelven en C2b3 (no en C2a); el singleton mutable no es estado
   final. Bundle no evaluable hasta desbloquear los 8 errores R7a.
4. `preview.mockSession/mockLocation` solo se preservan con transformación
   V2 demostrable; si no, STOP/defer con dueño, nunca fixture estático
   silencioso.
5. C2b5 retira solo USOS en callers, no helpers de `authoring-fixtures.ts`
   (D/E1). Input history solo desde `OverlayControlsHistoryV2` ya
   contenido en runtime/captura canónica, sin seeder API nueva; si no
   existe, STOP/defer E1. `engineer-radio` es auxiliar explícito: su
   cobertura pasa `engineerPresentation` por la frontera auxiliar sin
   snapshot, o STOP.
6. C2b6 se divide por superficies/variantes (6a, 6b…). Sin 10→2
   monolítico; variantes dev sintéticas solo se retiran tras probar que no
   son contrato de producto. TrackMap y transparent-shells incluyen su
   `buildMockTelemetry` oculto en aceptación/escaneo aunque no esté en las
   30 anclas.
7. C2b7: `projection-gaps` puede ir separado; `animation-scenes` incluye su
   migración de `buildAuthoringFixtureTelemetry`/`buildAuthoringFixtureWidget`
   a V2 o STOP/defer D/E1.
8. El guard numérico es condición necesaria, no suficiente: cada subcorte
   escanea TODO fichero tocado por `TelemetrySnapshot`,
   `buildMockTelemetry`, `buildAuthoringFixtureTelemetry`,
   `buildAuthoringFixtureWidget`, `authoring-fixtures`, puente antiguo y
   seeds, con dueño/justificación explícita de lo restante.
9. Se mantiene `B1 → C2 → B3 → B2-prep → B2` sin absorber E1/E4/D; si un
   STOP impide cerrar C2 antes de E1, se documenta la dependencia real y el
   micro-orden mínimo, sin mentir.
10. Spec + quality independientes por cada subcorte de código. Cero datos
    sintéticos y cero fallback silencioso.

Pendiente: re-review spec + quality del checkpoint C2b corregido antes de
escribir C2b0. `git diff --check` limpio en este commit documental.

## C2b re-review — checkpoint APROBADO y desbloqueado (ISA-894, solo docs)

Re-review spec Muse `ses_f9240634bffeNNMnf3wHltlOI6`: **APPROVE**,
P0/P1/P2/P3=0. Re-review quality Muse `ses_f923cf6acffeSiLRo6Z3APoEit`:
**APPROVE**, P0/P1/P2=0; P3 no bloqueante: el golden
`controls.history` trae 2 muestras y C2b5 activa STOP/defer E1 si son
insuficientes para la superficie que lo necesite. Cero código tocado; este
commit solo registra la aprobación en los tres documentos, sin reescribir la
historia anterior. Checkpoint C2b **desbloqueado, siguiente C2b0**.
`git diff --check` limpio en este commit documental.
