# ISA-894 · R7b: retirada del legacy frontend de telemetría V1 (microplan ejecutable)

Fecha: 2026-09-04. Revisión adversarial: REQUEST_CHANGES aplicado en esta
versión (corrección documentada en el handoff vivo). Issue: #894
(`roadmap:required`, ya declarada en la issue).
Rama única: `vantareapp/isa-894-retirada-v1-r7b`.
Worktree único y writer único: `C:\tmp\vantare-v1-retirada-r7b\vantare-v2`.
Base exacta: `5198e4cd5a007893faedd89151168ae26bf7e951` (R7a final).
Maestro: `docs/superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md`.
Predecesores: R7a final comprometido en esta misma línea
(`7ee3f87b` código/contratos + `5198e4cd` checkpoint documental);
PR draft de referencia R6b: #977 (R7b se apilará sobre él cuando exista su PR).

Estado de este documento: **solo plan**. No cambia código, no cambia entrega
pública y por tanto **no toca `plan.md` ni `roadmap.json` en este commit**.
`plan.md` + digest regenerado es **deuda obligatoria del PR que entregue
código R7b** (la issue es `roadmap:required`), no de este commit solo-plan:
el mero microplan no modifica el roadmap público.

**TDD y gates**: RED→GREEN aplica a los cambios conductuales **A–E**. **F no
es un subcorte TDD y no finge RED**: F1/F2 verifican el SHA final y cierran
documentación.

## Invariantes que todo subcorte respeta

- Rollback exclusivo por **build anterior preservada en R0** (artefacto privado
  + hash, compatibilidad verificada por código). **No probado**: la restauración
  física nunca se ejecutó; queda literal como **pendiente manual de Isaac**, no
  como build funcional físicamente probada. El binario nuevo no incluye V1 como
  plan B: sin switches de retorno ni shadow de compatibilidad.
- `Strategy` / `Engineer` / `Analysis` v1 son **contratos independientes vivos**;
  no forman parte de esta retirada.
- **Go / proyección tipada es la autoridad** de dominio. No crear snapshot
  genérico ni otra autoridad browser. Sin datos sintéticos, sin `Date.now` del
  frontend como autoridad temporal.
- No inventar datos ni renderer. No afirmar runtime no verificado.
- No usar `etc.` en asignaciones: todo consumidor citado lleva dueño/corte
  explícito (tabla de §B0).
- Commits pequeños en **UNA sola rama R7b** y **un único draft PR apilado sobre
  #977**. No múltiples PRs, no merge, no promoción, no release, no apps/LMU/
  navegadores, no `.env*`. Un writer, sin subagentes, sin producir código ahora.

## Orden de ejecución (secuencial, un writer)

```text
A paridad de historias V2 (prerrequisito, sin borrar nada legacy)
  → B guardias RED + retirada de transporte/proyección/harness V1
      (comparator/sanitizer y sus resultados se CONSERVAN como oráculo)
  → C daño (hipótesis contra productor) + fixture V2 puro y previews
  → D Host endurecido + definitions/viewmodels por lotes explícitos
  → E borrado final (módulos, switch, testdata) + comparator/sanitizer al final
  → F gates de SHA final y cierre documental (no TDD)
```

Restricciones de orden: ningún borrado de `TelemetrySnapshot`/derived antes de
que A esté verde; ningún borrado de `damage-reader`/builders legacy antes de
que C1 resuelva sus dos ramas con evidencia; comparator/sanitizer sobreviven a
D para que D no se quede sin oráculo (borrado en E4, justo antes de F).

---

## A · Prerrequisito de paridad: historias V2 sin sintéticos (hecho 2)

Hecho verificado en árbol: `derive.ControlSample` hoy es
`{Cursor, CapturedAt, Vehicle, Throttle, Brake, Clutch}` — **no contiene
speed/rpm/gear**, así que la historia actual no puede llamarse canónica
completa. A1 la expande en Go antes de proyectarla.

### A1 · Controles: expandir ControlSample en Go y proyectar historia compacta 120

- Objetivo: diseñar explícitamente la expansión Go: ampliar
  `derive.ControlSample` con `SpeedKPH`/`RPM`/`Gear` tomados del VehicleState
  activo canónico, conservar `CapturedAt` real; historia limitada a 120 con
  propiedad/reset/clone por epoch/session/stint según el patrón real vigente
  (p. ej. el tracker con epoch/session/player como `selfDeltaTracker`);
  proyectar en `OverlayFrameV2` mediante contrato tipado generado,
  preferentemente formato compacto (arrays paralelos y offsets temporales
  enteros relativos, no timestamps string repetidos); sin `Date.now` ni
  autoridad browser; compatibilidad/versionado aditivo; regenerar contrato solo
  con las tasks oficiales.
- Archivos permitidos/esperados: `internal/telemetry/derive/` (muestra,
  historia, ownership/reset/clone), `internal/telemetry/projection/overlayv2/`
  (builder/copia del campo histórico), tipos generados solo vía tasks
  oficiales, builder/view-model V2 de controles solo como decodificador,
  tests focales. Prohibido: tocar legacy, crear snapshot genérico, autoridad
  temporal browser.
- Test RED previo (triple): fuente/procedencia (cada muestra trae Speed/RPM/Gear
  del VehicleState canónico, no inventados); timestamps monótonos reales;
  tope 120 + reset por cambio de epoch/session/stint. Falla mientras falte
  cualquier pieza.
- Aceptación (máx. 3):
  1. Historia 120 con Speed/RPM/Gear canónicos, `CapturedAt` real monótono y
     reset canónico; frontend solo decodifica.
  2. Contrato regenerado con tasks oficiales, aditivo; bytes absolutos y delta
     de payload registrados sin superar `MaxPayloadBytes` del transporte.
  3. Focales + `go test` del paquete afectado en verde.
- Checks: focales RED→GREEN, `task telemetry:contract` +
  `task telemetry:contract:check`, `pnpm --dir frontend test` focal,
  `go test` paquete afectado, benchmark/tamaño golden contra frame actual.
- Reviewer: spec (contrato/autoridad) + quality en el PR apilado.
- Rollback/stop: revert del micro-commit. **STOP historias / STOP coste**: si
  falta VehicleState canónico, si exige snapshot genérico / autoridad browser /
  `Date.now`, o si la regresión de payload no es aceptable (supera
  `MaxPayloadBytes`; sin umbral numérico inventado: valen bytes
  absolutos/delta registrados) → parar y pedir ADR/decision; no borrar legacy.

### A2 · Fuel: ventana de cálculo intacta + NUEVA historia de consumo por vuelta 64

- Objetivo: mantener la ventana de cálculo existente
  (`DefaultFuelUsageWindow = 3`, `MaxFuelUsageWindow = 10`, verificado en
  `internal/telemetry/derive/fuel.go`) **separada** de una NUEVA historia de
  consumo por vuelta, p. ej. `FuelLapSample{Lap, Consumed}`, acotada a 64, con
  ownership/clone/reset canónicos. `OverlayFrameV2` publica la historia
  compacta tipada. Calcular en Go `sessionLaps` desde `SessionRemaining` +
  player `LastLapTime` **aun cuando gane la base fuel** (las dos bases
  `FuelBasisFuel`/`FuelBasisSession` ya existen en el frame); `requiredFuel` =
  perLap canónico × sessionLaps, con quality/presence/freshness resultante como
  peor calidad de las entradas y basis explícito. **No derivar `requiredFuel`
  de `EstimatedLaps` del fuel basis.**
- Archivos: `internal/telemetry/derive/fuel*` (historia nueva, cálculo
  `sessionLaps`/`requiredFuel`), `projection/overlayv2` builder/copia, tipos
  generados solo vía tasks oficiales, view-model V2 como decodificador, tests
  focales. Prohibido: alterar la ventana 3/10, sintéticos, autoridad browser.
- Test RED previo: serie (muestras reales por vuelta), límite 64, reset
  canónico, ausencia/calidad (peor calidad propagada, basis explícito) y cálculo
  (`requiredFuel` = perLap × sessionLaps con `SessionRemaining`+`LastLapTime`,
  independiente de `EstimatedLaps`). Falla sin cada pieza.
- Aceptación:
  1. Historia 64 real con reset canónico; ventana 3/10 intacta y separada.
  2. `requiredFuel` calculado en Go según fórmula fijada, con calidad peor-de y
     basis explícito; contrato regenerado + coste de payload medido.
  3. Focales + `go test` en verde.
- Checks/reviewer/rollback: como A1.
- Stop: como STOP historias de A1.

### A3 · Delta: la historia existe en derive pero NO está en frame; agregarla tipada/compacta

- Premisa corregida (verificada en árbol): `derive.SelfDelta.History
  []DeltaSample` **ya existe**, pero `DeltaViewV2` en `frame.go` **no tiene
  campo histórico**. El corte agrega el campo histórico tipado/compacto a
  `OverlayFrameV2` + builder/copia, conserva timestamps reales y el frontend
  solo decodifica. El singleton/`Date.now` frontend se elimina **solo después
  de verde**, no antes.
- Archivos: `frame.go` (campo nuevo), `builder_delta.go` + copia, tipos
  generados vía tasks, view-model/builder V2 de delta como decodificador, tests
  de regresión migrados a V2. Prohibido: pruebas automáticas de vueltas del
  jugador, snapshot genérico.
- Test RED previo: regresión estructural V2 que exige el campo histórico
  proyectado desde la historia canónica Go con timestamps reales; falla con
  singleton/`Date.now` o sin campo.
- Aceptación:
  1. Campo histórico delta en frame con timestamps reales; frontend decodifica.
  2. Singleton/`Date.now` eliminado después de verde; regresión estructural
     conservada en builders V2 (delta sigue excluido de pruebas automáticas de
     vueltas, **no** de regresión estructural).
  3. Contrato regenerado + payload medido.
- Checks/reviewer/rollback: como A1.
- Stop: como STOP historias de A1.

---

## B · Guardias RED, dueños explícitos y retirada V1 (hecho 1)

### B0 · Tabla cerrada de consumidores R0: dueño/corte explícito, sin "etc."

Cada consumidor recibe corte dueño. El worker fija rutas exactas en el RED de
B1; si una ruta no existe en árbol, lo registra como divergencia y para ese
ítem (no lo borra a ciegas):

| Consumidor | Corte dueño |
|---|---|
| CompositeApp | C2 (migra a fixture/frame V2 puro) |
| ObsOverlayApp | B2 (adapter SSE V1 fuera) + C2 si conserva previews |
| StudioRoute / studio-overlay-telemetry | C2 |
| telemetry-rate-coordinator y sus historias/API legacy | E1 (historias/API legacy fuera tras D) |
| overlay-wails-pull allowlist/counters | B2 |
| authoring fixtures completos | C2 (al fixture V2 puro) |
| mock-scenarios | E1 |
| OverlayParityHarness | C2 (misma migración Host) |
| OverlayWorkshopDevRoute | C2 |
| studio-v1-snapshot-test-harness | E1 (tras C2; último consumidor snapshot) |
| vite.config / index.html / overlay.html | E3 si referencian harness V1 |
| scripts sesion-v1 y bench | B3 (scripts) / E3 (bench Go huérfano) |

`Strategy`/`Engineer`/`Analysis` v1 quedan exentos por contrato independiente.

### B1 · Guardias RED de ausencia V1 frontend

- Objetivo: fijar guardias estructurales que fallan mientras exista V1
  productivo en frontend (`overlay-projection-v1`,
  `adapter`/`observer`/`projection-telemetry-adapter`, shadow
  runtime/comparator/sanitizer, harnesses/scripts/HTML, `ProductID` overlay,
  eventos/allowlist/counters V1). El guardia cita comparator/sanitizer como
  **diferidos a E4** (oráculo vivo hasta entonces), no como borrado de B.
- Archivos permitidos/esperados: tests de guardia nuevos + evidencia; ningún
  borrado todavía.
- Test RED previo: **este subcorte ES el RED** — los guardias fallan en rojo
  citando restos V1 con rutas exactas y la tabla B0.
- Aceptación:
  1. Guardia rojo reproducible que cita cada resto productivo V1 + su corte dueño.
  2. `Strategy`/`Engineer`/`Analysis` v1 explícitamente exentos y en verde.
  3. Cero cambios productivos en este commit.
- Checks: `pnpm --dir frontend test` focal del guardia (rojo esperado),
  `git diff --check`.
- Reviewer: spec.
- Rollback/stop: revert del commit. Stop si un resto citado resulta ser
  consumidor necesario sin migrar → reclasificar en B0, no borrar.

### B2 · Retirar proyección/adapter/observer/transporte V1 + eventos/allowlist/counters

- Objetivo: poner en verde el guardia retirando lo citado en B1, con contratos
  explícitos de ausencia. Incluye `overlay-wails-pull` allowlist/counters V1.
- Archivos: `overlay/projection/overlay-projection-v1*`,
  `overlay-projection-adapter*`, `transports/projection-telemetry-adapter*`,
  `transports/projection-observer*`, eventos/allowlist/counters exclusivos V1,
  `ProductID` overlay, ObsOverlayApp (parte adapter), y sus tests exclusivos.
  Prohibido tocar V2/host/fixtures de otros subcortes en el mismo commit; no
  tocar comparator/sanitizer (E4).
- Test RED previo: guardia B1 en rojo.
- Aceptación:
  1. Guardia B1 en verde (salvo diferidos E4); cero referencias productivas.
  2. Contratos explícitos de ausencia donde había tipos/eventos V1.
  3. Focales + typecheck del área en verde.
- Checks: focales, `pnpm --dir frontend typecheck`, `rg` de ausencia del lote.
- Reviewer: spec + quality en el PR.
- Rollback/stop: revert del micro-commit (rollback real = build anterior R0,
  restauración física pendiente de Isaac). Stop si aparece caller productivo no
  inventariado → parar el lote.

### B3 · Retirar shadow runtime V1 + harnesses/scripts/HTML (comparator/sanitizer EXCLUIDOS)

- Objetivo: retirar el runtime del shadow de compatibilidad V1 y sus
  harnesses/scripts/HTML (incluidos scripts sesion-v1). **Comparator/sanitizer
  y sus resultados se conservan** como oráculo de D; su borrado vive en E4.
- Archivos: runtime del shadow, `telemetry-cutover-runtime-harness`,
  `telemetry-overlay-shadow-harness`, scripts sesion-v1, scripts/HTML de
  harness V1, y sus tests exclusivos.
- Test RED previo: guardia B1 (parte runtime/harness) en rojo.
- Aceptación:
  1. Runtime/harness V1 ausentes del bundle y del árbol productivo.
  2. Guardia correspondiente en verde; comparator/sanitizer intactos y citados.
  3. Tests semánticos útiles migrados a frontera V2 o citados como evidencia
     histórica (no debilitados).
- Checks: focales, build frontend del área o completa según alcance, `rg` ausencia.
- Reviewer: quality.
- Rollback/stop: revert del micro-commit. Stop si un harness es la única
  cobertura de una garantía V2 → migrar cobertura primero.

---

## C · Daño como hipótesis + fixture V2 puro (hechos 3 y 4, primera mitad)

### C1 · Daño: hipótesis verificada contra el productor real, no hecho

- Hecho verificado en árbol (no presuponer más): `DamageViewV2` ya publica
  `dents`/`overheating`/`detached`/`wheelDetachedCount` mapeados desde el estado
  canónico de daño; el legacy `car-damage-visual` muestra `tyres` fraccionales
  vía `damage-reader` + snapshot. Lo no probado —y por tanto hipótesis— es qué
  produce productivamente el productor legacy y qué se consume visiblemente.
- Objetivo (ramas excluyentes, ambas con evidencia):
  1. Auditar productor legacy y consumo visible de tyres fraccionales y de
     `wheelDetachedCount`.
  2. Rama A: si `wheelDetachedCount` es información visible/producida, añadir el
     campo canónico V2 que falte y mapearlo (hoy el view ya lo publica: verificar
     el mapeo, no duplicarlo); re-apuntar definitions a V2.
  3. Rama B: si no se renderiza productivamente, registrar decisión deliberada
     con evidencia (ruta/línea del productor y del consumo) y re-apuntar igual.
  4. Documentar diferencias de tyres **solo tras probar el productor**; borrar
     `damage-reader` y builders legacy únicamente en la rama resuelta.
- Archivos: definitions de `car-damage-*`, view-models/builders legacy de daño,
  damage-reader, tests; campo canónico V2 solo en rama A. Prohibido: inventar
  fracciones, crear renderer, afirmar producción no probada.
- Test RED previo: test que exige definitions resolviendo a V2 + la rama
  resuelta con su evidencia (mapeo verificado en A, decisión registrada en B);
  falla antes.
- Aceptación:
  1. Rama resuelta con evidencia de productor; definitions a V2.
  2. `damage-reader` y builders legacy ausentes solo tras la resolución.
  3. Focales en verde sin datos inventados.
- Checks: focales, `rg` ausencia damage-reader, `pnpm --dir frontend typecheck`
  del área.
- Reviewer: spec (verifica no-invención) + quality.
- Rollback/stop: revert. **STOP daño**: si el productor produce algo visible
  sin equivalente V2 y añadirlo exige nueva autoridad o arquitectura → parar,
  pedir decisión/ADR; nunca inventar el dato.

### C2 · Fixture V2 puro + migración de previews (la rama legacy del Host AÚN puede existir)

- Objetivo: crear fixture V2 puro (no wrapper de snapshot) y migrar los
  callers/previews de la tabla B0 (CompositeApp, StudioRoute, authoring
  fixtures, OverlayParityHarness, OverlayWorkshopDevRoute y sus tests).
  Preservar InPlaceEdit/Studio real ya V2. La rama legacy del Host **puede
  seguir existiendo** durante C2; la elimina D1.
- Archivos: nuevo fixture V2, consumidores citados y sus tests. Prohibido:
  wrapper sobre snapshot legacy, tocar el Host o definitions de D.
- Test RED previo: test que afirma que **ningún preview/caller migrado pasa
  snapshot/wrapper legacy** (render contra fixture/frame V2 puro). Expresamente
  **NO** afirma que el Host entero ya sea V2-only — eso lo verifica D1.
- Aceptación:
  1. Fixture V2 puro; previews/callers citados sin snapshot/wrapper legacy.
  2. InPlaceEdit/Studio real ya V2 preservados.
  3. Tests migrados en verde.
- Checks: focales, `pnpm --dir frontend typecheck` del área.
- Reviewer: quality.
- Rollback/stop: revert. Stop si una preview pierde información visible sin
  equivalente V2 → volver a A (paridad) antes de migrarla.

---

## D · Host endurecido + definitions/viewmodels en lotes explícitos (hechos 4–6 parcial)

### D1 · Endurecer WidgetVisualHost (después de C2: cero callers, entonces eliminar)

- Objetivo: con C2 verde, verificar cero callers de la prop snapshot/rama
  legacy/hack de input y **entonces** eliminarlos del Host; exigir
  `frame`/`source` para los 18 V2 y auxiliar explícito para Calendar/Engineer.
- Archivos: `overlay/core/WidgetVisualHost.tsx` y sus tests. Prohibido mezclar
  con borrado de definitions en el mismo commit.
- Test RED previo: test que verifica cero callers legacy y exige Host sin prop
  snapshot/rama legacy/hack, con `frame`/`source` obligatorios (auxiliar solo
  Calendar/Engineer); falla antes.
- Aceptación:
  1. Cero callers verificado; prop/rama/hack eliminados.
  2. `frame`/`source` exigidos para los 18 V2; auxiliar solo Calendar/Engineer.
  3. Tests del Host en verde.
- Checks: focales, `pnpm --dir frontend typecheck`, lint del archivo.
- Reviewer: spec + quality.
- Rollback/stop: revert. Stop si queda un caller productivo → volver a C2, no
  reabrir la prop.

### D2 · Lote core/status: standings, relative, delta, fuel-strategy, pedals-telemetry, input-telemetry

- Objetivo: retirar `buildViewModel` legacy de estas 6 definitions y sus
  viewmodels/tests redundantes; tests semánticos a builders V2.
- Archivos: las 6 definitions + view-model legacy + tests redundantes;
  builders V2 destino. Prohibido mezclar con D3/D4/E/F.
- Test RED previo: ausencia de `buildViewModel` legacy en el lote + cobertura
  semántica en builders V2; falla antes.
- Aceptación:
  1. Lote sin `buildViewModel` legacy ni redundantes.
  2. Semántica migrada a builders V2 (no debilitada).
  3. Comparator/sanitizer (oráculo) intactos.
- Checks: focales del lote, `pnpm --dir frontend typecheck`, `rg` ausencia.
- Reviewer: quality (spec si cambia contrato visible). Commit/review/gate
  independientes de este lote.
- Rollback/stop: revert del lote. Stop si falta equivalente V2 → reclasificar
  a paridad (A).

### D3 · Lote dinámicos: racing-flags, delta-advanced, delta-trace, pedals, pedals-telemetry-compact, multiclass-relative

- Objetivo, archivos, RED, aceptación, checks, reviewer y rollback/stop: como
  D2, aplicado a estas 6 definitions. Commit/review/gate independientes.

### D4 · Lote espacial/broadcast/daño: head-to-head, track-map, broadcast-tower, track-weather, car-damage-numbers, car-damage-visual

- Objetivo, archivos, RED, aceptación, checks, reviewer y rollback/stop: como
  D2, aplicado a estas 6 definitions (daño solo tras C1 resuelto).
  Commit/review/gate independientes.

### D5 · Corte auxiliar explícito: race-schedule y engineer-radio (se conservan)

- Objetivo: dejar constancia de que `race-schedule` (Calendar) y
  `engineer-radio` son auxiliares con fuentes propias, **no telemetría V2**;
  se conservan y no se cuentan en los 18 V2.
- Archivos: solo los auxiliares citados y sus tests. Sin borrado.
- Test RED previo: no aplica (conservación, no cambio conductual); se verifica
  con sus tests existentes en verde.
- Aceptación:
  1. Auxiliares intactos con fuentes explícitas.
  2. Ningún lote D2–D4 los incluye.
  3. Tests existentes en verde.
- Checks: focales, `pnpm --dir frontend typecheck` del área.
- Reviewer: quality.
- Rollback/stop: revert. Stop si un auxiliar depende de un módulo E1 → citarlo
  y resolver antes de E1.

---

## E · Borrado final + comparator/sanitizer al final + switch sin disyunción (hechos 6–8)

### E1 · Retirar telemetry-snapshot, telemetry-adapter, derived store, acumulador de input, mocks y preview fixtures

- Objetivo: retirar `telemetry-snapshot`, `telemetry-adapter`, derived store,
  acumulador de input, mock-scenarios y widget preview fixtures legacy
  (incluye `studio-v1-snapshot-test-harness` como último consumidor snapshot y
  las historias/API legacy de telemetry-rate-coordinator), con tests semánticos
  ya migrados a builders V2 (D).
- Archivos: módulos citados + tests. Conservar auxiliares D5.
- Test RED previo: guardia de ausencia del lote; falla mientras exista.
- Aceptación:
  1. Módulos citados ausentes del árbol productivo y del bundle.
  2. Cobertura semántica vive en builders V2.
  3. Auxiliares D5 intactos.
- Checks: focales, `pnpm --dir frontend typecheck`, build, `rg` ausencia.
- Reviewer: quality.
- Rollback/stop: revert. Stop si algo citado sigue importado por un preview
  no migrado → volver a C2.

### E2 · Switch overlay-v2-features: expectativa única y falsable, sin disyunción

- Expectativa única: **retirar por completo** el rollback mutable, los globals
  `window`, los setters y las suscripciones del switch diagnóstico
  `overlay-v2-features`. Sin camino de vuelta dentro del binario; el rollback
  aprobado es la build anterior R0 (restauración física pendiente de Isaac).
- Si demand/capabilities necesita catálogo: separarlo explícitamente como
  **datos estáticos V2 directos en símbolo/archivo distinto**, sin switch, sin
  mutabilidad y sin retorno V1. No hay disyunción: o se retira todo, o el
  residuo estático vive aislado y falsable por `rg` (cero `window`, cero
  setters, cero suscripciones).
- Archivos: switch, globals, setters, suscripciones y tests asociados; archivo
  de datos estáticos solo si aplica la separación.
- Test RED previo: test que exige ausencia total de switch/globals/setters/
  suscripciones (y, si aplica, presencia del dato estático aislado); falla antes.
- Aceptación:
  1. Cero switch/globals/setters/suscripciones en árbol y bundle.
  2. Residuo estático —si existe— aislado, sin mutabilidad ni retorno V1.
  3. Focales en verde.
- Checks: focales, `rg` ausencia, `pnpm --dir frontend typecheck`.
- Reviewer: spec + quality.
- Rollback/stop: revert. **STOP switch/ADR**: si la separación exige cambiar
  capabilities/demand o arquitectura inesperada → parar, fijar stop condition
  con ADR; no reintroducir switch de retorno.

### E3 · Borrar testdata Go overlay V1 huérfano + packages scripts/harnesses, limpiar bundle

- Objetivo: borrar el `testdata` Go de overlay V1 quedado huérfano en R7a
  (`internal/telemetry/projection/overlay/testdata/`), bench Go huérfano,
  `vite.config`/`index.html`/`overlay.html` solo si referencian harness V1, y
  limpiar el bundle.
- Archivos: testdata huérfano, bench/scripts restantes, config de bundle si
  aplica.
- Test RED previo: guardia que exige cero referencias productivas al testdata
  y a los packages; falla si algo los importa.
- Aceptación:
  1. Testdata huérfano y packages citados borrados.
  2. Cero imports productivos restantes.
  3. Bundle sin legacy (verificado en F1).
- Checks: `go test` paquetes afectados, focales frontend, `rg` ausencia.
- Reviewer: quality.
- Rollback/stop: revert. Stop si algún test/harness R7b aún los importa →
  completar C/D/E1 primero.

### E4 · Retirar comparator/sanitizer y sus resultados (oráculo hasta el final)

- Objetivo: solo con D y E1 verdes, retirar comparator/sanitizer y sus
  resultados, conservando su evidencia histórica (no se reescribe historia).
  D ya no los necesita; F verifica ausencia total.
- Archivos: `overlay/telemetry-shadow/` restante (comparator/sanitizer),
  resultados asociados, tests exclusivos. Evidencia histórica conservada en
  `docs/telemetry-core/evidence/isa-894/`.
- Test RED previo: guardia final que exige ausencia del shadow completo;
  falla mientras exista.
- Aceptación:
  1. Shadow completo ausente del árbol productivo y del bundle.
  2. Evidencia histórica conservada y citada.
  3. Focales en verde sin oráculo (las garantías ya viven en builders V2).
- Checks: focales, build, `rg` ausencia total del shadow.
- Reviewer: quality + spec (cierre de garantías).
- Rollback/stop: revert. Stop si una garantía semántica no tiene cobertura V2
  → no borrar; reclasificar a D/A.

---

## F · Gates de SHA final y cierre (hecho 9) — verificación, no TDD

### F1 · Verificación final de ausencia, bundle y gates completos

- Objetivo: demostrar binario sin V1 y gates completos sobre el SHA final.
  No cambia código: no hay RED previo ni GREEN; hay verificación.
- Archivos: ninguno productivo (solo evidencia en
  `docs/telemetry-core/evidence/isa-894/`).
- Aceptación:
  1. `rg`/guardias de ausencia: cero referencias productivas/bundling legacy.
  2. Gates completos en verde sobre el SHA final (ver Checks finales).
  3. Dos reviews frescas con P0/P1/P2=0.
- Checks: ver Checks finales obligatorios.
- Reviewer: dos reviewers independientes (spec + quality).
- Stop: si un gate falla por causa no entendida → stop general, no se abre PR.

### F2 · Cierre docs/evidence/handoff/issue + plan.md y roadmap en el PR de código

- Objetivo: cerrar evidencia, handoff, issue y —como deuda obligatoria del PR
  de código por `roadmap:required`— `plan.md` + `roadmap.json` regenerado
  (nunca editado a mano).
- Archivos: evidencia, handoff vivo, `plan.md`, `roadmap.json` (solo vía
  script). Este microplan documental no los toca.
- Aceptación:
  1. Evidencia literal con inventario borrado/preservado, TDD rojo/verde, gates.
  2. Handoff e issue reflejan estado real (rama/SHA/PR/CI, sin afirmar merge).
  3. `plan.md` actualizado + digest regenerado con `--check` verde **en el
     mismo PR de código**.
- Checks: `roadmap_digest.py` + `--check`, `git diff --check`.
- Reviewer: orquestador.
- Stop: si la issue/base/SHA no coinciden → parar.

---

## Checks finales obligatorios (sobre el SHA final R7b, antes de abrir el draft PR)

- Focales RED→GREEN de cada subcorte A–E + contrato generado
  (`task telemetry:contract` y `task telemetry:contract:check` si aplica).
- `pnpm --dir frontend test`, `pnpm --dir frontend typecheck`
  (comando exacto; resuelve `tsc -b --noEmit`, nunca `tsc -p tsconfig.json`),
  `pnpm --dir frontend build`, `pnpm --dir frontend lint`.
- `gofmt` en Go tocado; `go test ./... -count=1`; `go vet ./...`
  (separar deuda heredada —tres `unsafe.Pointer` fuera del diff— de regresiones).
- Roadmap digest + check en el PR de código:
  `python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly`
  y la misma orden con `--check`.
- `rg`/guardias/bundle de ausencia: cero V1 productivo en árbol y bundle.
- Dos reviews frescas (spec + quality) con P0/P1/P2=0 sobre el SHA final.
- Checks no ejecutados y motivo, si los hay.

## Stops específicos (además de los generales de AGENTS.md)

- **Historias/coste (A)**: sin VehicleState canónico, necesidad de snapshot
  genérico / autoridad browser / `Date.now`, o payload que supera
  `MaxPayloadBytes` → parar, pedir ADR.
- **Daño (C1)**: producción visible sin equivalente V2 que exija nueva
  autoridad o arquitectura → parar, pedir decisión/ADR; nunca inventar el dato.
- **Feature switch (E2)**: separación que exige cambiar capabilities/demand o
  arquitectura inesperada → parar, ADR; no reintroducir switch.

## Entrega

Commits pequeños, staging limitado a rutas, en la rama única R7b; **un único
draft PR apilado sobre #977** hacia `nightly`; sin merge, promoción, release
ni anuncio. Terminado en rama, integrado, promocionado y publicado son estados
distintos: el reporte final identifica rama, base, HEAD, commit, push, PR, CI
y nivel realmente alcanzado, sin afirmar datos ni runtime no verificados.
