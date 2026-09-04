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

**TDD y gates**: RED→GREEN aplica a los subcortes conductuales **A–E excepto
D5** (D5 es conservación/verificación, solo verificación). **F no
es un subcorte TDD y no finge RED**: F1/F2 verifican el SHA final y cierran
documentación.

**Evidencia de payload de A**: cada subcorte A registra bytes absolutos y delta
antes/después en la evidencia exacta
`docs/telemetry-core/evidence/isa-894/retirada-v1-r7b-frontend-20260904.md`.

**Gate de payload efectivo**: `DefaultPublisherMaxPayloadBytes = 64 * 1024` en
`internal/app/telemetrytransport/publisher.go`, impuesto por el Publisher; el
`MaxPayloadBytes = 256 * 1024` del Hub (`transport.go`) es solo invariante
secundaria (techo duro). `frame_test.go` ya exige frame sintético completo con
104 vehículos < 64 KiB: el frame V2 @104 con las historias A debe permanecer
< 64 KiB.

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

### A1 · Controles: expandir ControlSample en Go y proyectar historia cerrada 120

- Hechos de árbol (no negociar): `derive.ControlSample` es hoy
  `{Cursor, CapturedAt, Vehicle, Throttle, Brake, Clutch}` sin speed/rpm/gear
  (`builder_controls.go:26-28` lo declara gap); el reset vigente de
  `ControlsHistory` es `mustReset` por epoch + `SameSession`
  (`pipeline.go:336-339`), NO stint/player; la fuente canónica es el
  VehicleState activo con `SpeedMPS` (m/s, no kPH), `EngineRPM` y `Gear`
  (`core/reducer.go:54-56`, `vehicle.Gear` = int32); el wire actual
  `ControlsHistoryV2` publica pedales per-mille + `WindowMS`/espaciado igual,
  declarado como diferencia contra V1 (`frame.go:173-198`).
- Objetivo (formato completamente cerrado, autocorregido cache-safe): ampliar
  `derive.ControlSample` con exactamente `SpeedMPS schema.Field[float64]`
  (m/s, unidad de la fuente; la presentación a km/h es solo formato en el
  decoder), `EngineRPM schema.Field[vehicle.EngineRPM]` y `Gear
  schema.Field[vehicle.Gear]` —no escalares— para conservar
  present/freshness/provenance en Core, tomados del VehicleState activo
  canónico, conservando `CapturedAt` real; historia limitada a 120 con el
  reset vigente epoch+SameSession y clone ya existente (`cloneFinal`);
  proyectar en `OverlayFrameV2` el tipo cerrado `ControlsHistoryV2 { Q Quality;
  CapturedAtMS []int64; Throttle []int16; Brake []int16; Clutch []int16;
  SpeedMPS []QValue[float64]; RPM []QValue[float64]; Gear []QValue[int32] }`,
  máximo 120, con `CapturedAtMS[i]` = epoch Unix en milisegundos de cada
  `sample.CapturedAt` real. `Q` cubre la serie/pedales; las tres series nuevas
  llevan calidad propia por muestra: todas las arrays SIEMPRE alineadas por
  índice con pedales y `CapturedAtMS`; cada `QValue` conserva
  missing/stale/invalid/fresh y no emite `V` cuando missing; nunca acortar una
  array por missing, nunca sentinel, nunca pérdida. La proyección convierte
  `schema.Field` → `QValue`; la autoridad/procedencia de las tres series se
  documenta native/observed desde VehicleState, no inventada. Se elige timestamp
  absoluto entero (no string repetida, no edad relativa) porque la sección puede
  sobrevivir a varios `frame.GeneratedAt`: `CachedProjector` reutiliza secciones
  memoizadas (`cadence.go:331-340`) y una edad cacheada cambiaría de
  significado; el implementador no debe rebasar edades ni romper memoización.
  El decoder frontend usa directamente `CapturedAtMS`, sin `Date.now` ni
  autoridad browser; preserva la información del contrato legacy legítimo
  (pedales + speed/rpm/gear por muestra con su base temporal real). Tipos
  generados solo vía tasks oficiales, versionado aditivo.
- Archivos permitidos/esperados: `internal/telemetry/derive/` (muestra,
  historia, reset vigente, clone), `internal/telemetry/projection/overlayv2/`
  (`frame.go`, `builder_controls.go`, copia), tipos generados solo vía tasks
  oficiales, decoder frontend de controles, tests focales. Prohibido: tocar
  legacy, crear snapshot genérico, autoridad temporal browser, llamar SpeedKPH
  canónico a una fuente en m/s, escalares sin calidad en derive, arrays
  acortadas por missing, sentinels.
- Test RED previo (triple): fuente/procedencia (SpeedMPS/EngineRPM/Gear del
  VehicleState canónico como `schema.Field` con unidades, calidad y procedencia
  preservadas); timestamps absolutos reales monótonos (no `WindowMS`/espaciado
  igual, no edades relativas); tope 120 + reset epoch+SameSession + alineación
  total con `QValue` sin `V` en missing. Falla mientras falte cualquier pieza.
- Aceptación (máx. 3):
  1. Historia 120 con tipos exactos fijados, timestamps absolutos y reset
     vigente; frontend solo decodifica y formatea.
  2. Contrato regenerado con tasks oficiales, aditivo; frame V2 @104 < 64 KiB;
     bytes absolutos y delta registrados en la evidencia exacta.
  3. Focales + `go test` del paquete afectado en verde.
- Microcheckpoints ordenados EN LA MISMA rama/PR (ninguna otra rama):
  a. derive RED→GREEN (gate: `go test` del paquete derive afectado);
  b. projection/frame/builder/copia (gate: `go test` overlayv2 + `frame_test`
     < 64 KiB en verde);
  c. contrato generado con `task telemetry:contract` + `:check` (gate: check
     verde; no se exige typecheck frontend antes de regenerar tipos);
  d. decoder frontend + focales + golden/payload en evidencia exacta (gate:
     `pnpm --dir frontend test` focal y `pnpm --dir frontend typecheck` verdes).
  Cada checkpoint coherente y verificable en su capa.
- Checks: los cuatro checkpoints + benchmark/tamaño golden contra frame actual.
- Reviewer: spec (contrato/autoridad) + quality en el PR apilado.
- Rollback/stop: revert del micro-commit. **STOP historias / STOP coste**: si
  falta VehicleState canónico, si exige snapshot genérico / autoridad browser /
  `Date.now`, o si el frame @104 no queda < 64 KiB (gate efectivo Publisher;
  Hub 256 KiB solo secundaria; si el formato con calidad por muestra no cabe,
  STOP y diseño/ADR, no sentinel ni pérdida) → parar y pedir ADR/decision;
  no borrar legacy.

### A2 · Fuel: contrato y semántica fijados (el writer no decide)

- Hechos de árbol: ventana `DefaultFuelUsageWindow = 3` / `MaxFuelUsageWindow
  = 10` (`derive/fuel.go:13-17`); `sessionLapsRemaining` ya calcula
  ceil(sessionRemaining/lastLapTime) con peor calidad (`builder_fuel.go:104`);
  `builder_fuel.go:44-48` afirma hoy que `requiredFuel` permanece ausente — este
  corte **deroga explícitamente ese comentario** al publicar el segundo campo
  de vueltas que el comentario echaba en falta.
- Contrato fijado: `FuelHistoryV2 { Q Quality; Lap []int32; Consumed []float64 }`,
  arrays alineados, máximo 64, consumo en la unidad declarada por el frame
  (litros canónicos, conversión a preferencia solo en presentación);
  `FuelViewV2` añade `History FuelHistoryV2`, `SessionLaps QValue[float64]`,
  `RequiredFuel QValue[float64]`. `Basis` actual sigue describiendo **solo**
  `EstimatedLaps`. `RequiredFuel = PerLap × SessionLaps`, calculado en Go desde
  `SessionRemaining` + player `LastLapTime` aun cuando gane la base fuel; su
  base es `SessionLaps` y su quality es peor-de, nunca `EstimatedLaps`. La
  ventana de promedio 3/10 queda separada e intacta.
- Archivos: `internal/telemetry/derive/fuel*` (historia nueva + ownership/clone/
  reset canónicos), `builder_fuel.go` (derogación del comentario + cálculo),
  `frame.go`, tipos generados solo vía tasks oficiales, view-model V2 como
  decodificador, tests focales. Prohibido: alterar la ventana 3/10, sintéticos,
  autoridad browser, derivar de `EstimatedLaps`.
- Test RED previo: serie (muestras reales por vuelta), límite 64, reset
  canónico, ausencia/calidad (peor calidad propagada, basis explícito) y cálculo
  (`RequiredFuel` = PerLap × SessionLaps, independiente de `EstimatedLaps`).
  Falla sin cada pieza.
- Aceptación:
  1. Historia 64 real con reset canónico; ventana 3/10 intacta y separada.
  2. `SessionLaps`/`RequiredFuel` según fórmula fijada; frame V2 @104 < 64 KiB;
     bytes absolutos y delta en la evidencia exacta.
  3. Focales + `go test` en verde.
- Microcheckpoints ordenados EN LA MISMA rama/PR (ninguna otra rama):
  a. derive RED→GREEN, historia 64 + cálculo (gate: `go test` derive);
  b. projection/frame/builder/copia + `frame_test` 64 KiB (gate: `go test`
     overlayv2 en verde);
  c. contrato generado con `task telemetry:contract` + `:check` (gate: check
     verde; sin typecheck frontend previo);
  d. decoder frontend + focales + golden/payload en evidencia exacta (gate:
     `pnpm --dir frontend test` focal y `pnpm --dir frontend typecheck` verdes).
- Checks/reviewer/rollback: como A1.
- Stop: como STOP historias / STOP coste de A1.

### A3 · Delta: campo histórico mínimo y mapping exacto

- Hechos de árbol: `derive.SelfDelta.History []DeltaSample` ya existe
  (`delta.go:41`), con `DeltaSample {Cursor, CapturedAt, SourceTime,
  LapDistance, Seconds}` (`delta.go:29-35`); `DeltaViewV2` no tiene campo
  histórico (`frame.go:248-255`); `Trend` queda vacío por diseño porque el
  concepto lo posee delta-trace (`builder_delta.go:44-47`).
- Contrato fijado (mínimo, cache-safe): `DeltaHistoryV2 { Q Quality;
  CapturedAtMS []int64; Seconds []float64 }`, arrays alineados, máximo
  `MaxSelfDeltaHistory = 120` (`delta.go:21`); `CapturedAtMS[i]` = epoch Unix en
  ms de cada `sample.CapturedAt` real; el decoder frontend usa directamente ese
  valor, sin string timestamps ni `Date.now`, sin reconstrucción dependiente del
  frame. Misma razón que A1: la sección delta puede sobrevivir memoizada a
  varios `frame.GeneratedAt` (`cadence.go:331-340`); una edad cacheada cambiaría
  de significado. No se transportan `SourceTime`/`LapDistance`:
  ningún consumidor legítimo los usa en el wire. `Trend` conserva el
  comportamiento actual (vacío en builder; delta-trace posee el concepto).
  Mapping exacto: derive (`SelfDelta.History`, `Freshness`) → frame
  (`DeltaViewV2.History` vía `BuildDelta` + copia) → TS generado →
  decoder (instantes absolutos + segundos con calidad).
- El singleton/`Date.now` frontend se elimina **solo después de verde**.
- Archivos: `frame.go` (campo nuevo), `builder_delta.go` + copia, tipos
  generados vía tasks, decoder V2, tests de regresión migrados a V2. Prohibido:
  pruebas automáticas de vueltas del jugador, snapshot genérico.
- Test RED previo: regresión estructural V2 que exige el campo histórico
  proyectado con instantes absolutos reales; falla con singleton/`Date.now` o sin campo.
- Aceptación:
  1. Campo histórico delta con instantes absolutos reales; frontend decodifica.
  2. Singleton/`Date.now` eliminado después de verde; regresión estructural
     conservada (delta sigue excluido de pruebas automáticas de vueltas,
     **no** de regresión estructural).
  3. Frame V2 @104 < 64 KiB; bytes absolutos y delta en la evidencia exacta.
- Microcheckpoints ordenados EN LA MISMA rama/PR (ninguna otra rama):
  a. derive RED→GREEN, campo histórico (gate: `go test` derive);
  b. projection/frame/builder/copia + `frame_test` 64 KiB (gate: `go test`
     overlayv2 en verde);
  c. contrato generado con `task telemetry:contract` + `:check` (gate: check
     verde; sin typecheck frontend previo);
  d. decoder frontend + focales + regresión estructural + golden/payload en
     evidencia exacta (gate: `pnpm --dir frontend test` focal y
     `pnpm --dir frontend typecheck` verdes).
- Checks/reviewer/rollback: como A1.
- Stop: como STOP historias / STOP coste de A1.

---

## B · Guardias RED, dueños explícitos y retirada V1 (hecho 1)

### B0 · Tabla cerrada de consumidores R0: 13 grupos con dueño/corte explícito, sin "etc."

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
| vite.config / index.html / overlay.html | E3 solo si `rg` demuestra referencias V1 (verificado limpio: no se tocan) |
| scripts/bench/sesion-v1-* (`sesion-v1.ps1`, `sesion-v1-resumen.mjs`, `sesion-v1-resumen.test.mjs`, `sesion-v1-state.test.mjs` + refs en `all.test.mjs`/README) | B3 (dueño exclusivo) |
| entrypoints históricos frontend del research bench (`docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts`, `frontend-bench.mjs`) | E3 (dueño exclusivo; el Go bench del mismo dir y `compact_frame.go` se preservan, sin dueño de borrado) |

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
  harnesses/scripts/HTML (incluidos los 4 scripts sesion-v1-* con sus
  referencias). B3 es **dueño exclusivo** del runtime, los 2 packages harness
  (`telemetry-cutover-runtime-harness`, `telemetry-overlay-shadow-harness`) y
  los scripts/HTML sesion-v1: **ningún otro subcorte los declara DELETE**.
  **Comparator/sanitizer
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
- Test RED previo: no hay RED — D5 es conservación/verificación, no cambio
  conductual; se verifica con sus tests existentes en verde.
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

### E2 · Switch overlay-v2-features: decisión fijada según callsites reales, sin disyunción

- Hechos de árbol (`frontend/src/overlay/telemetry-shadow/overlay-v2-features.ts`,
  125 líneas): el catálogo estático (`OVERLAY_V2_*`, `OverlayV2Feature`,
  `DEFAULT_OVERLAY_V2_FEATURES`, `hasOverlayV2Feature` pura) convive con la
  maquinaria mutable (`createOverlayV2FeaturesGeneration`, `activeGeneration`,
  `setRollback`/`ROLLBACK_FEATURES`, `parseOverlayV2Features`,
  `readDiagnosticOverlayV2Features`, `writeOverlayV2Rollback`,
  `readOverlayV2Rollback`, globals `window.__vantareSet/GetOverlayV2Rollback`,
  evento `vantare:overlay-v2-rollback-changed`). Callsites reales: CompositeApp,
  ObsOverlayApp y StudioRoute crean generación + `useSyncExternalStore`
  (subscribe/getSnapshot) + `dispose`; el snapshot (array estático en la
  práctica) fluye como prop hasta el runtime (`InPlaceWidgetEditFrame`), que lo
  consume como dato, no como switch.
- Decisión fijada (no disyunción): el catálogo estático se conserva **movido**
  a `frontend/src/overlay/core/overlay-v2-feature-catalog.ts` (constantes, tipo,
  `DEFAULT_OVERLAY_V2_FEATURES`, `hasOverlayV2Feature` pura). Se elimina
  `createOverlayV2FeaturesGeneration`, `activeGeneration`, `setRollback`,
  `subscribe`, `parseOverlayV2Features`, los readers/writers diagnósticos, los
  globals `window` y toda mutabilidad. CompositeApp/ObsOverlayApp/StudioRoute
  pasan a usar el default estático directo: fuera generación, suscripción,
  `dispose` y campo de generación; las props downstream conservan el tipo
  estático del catálogo (sigue haciendo falta el dato; ya no hace falta gating).
  Sin parse/switch mutable.
- Archivos: `telemetry-shadow/overlay-v2-features.ts` (queda vacío → se borra),
  nuevo `overlay/core/overlay-v2-feature-catalog.ts`, los tres callsites +
  props downstream, `overlay-v2-features.test.ts` (se reescribe a catálogo
  estático o se borra si solo cubría la maquinaria), tests `*-domain-free`
  que importen el switch.
- Test RED previo: test que exige cero `createOverlayV2FeaturesGeneration`/
  `activeGeneration`/`setRollback`/`subscribe`/`parseOverlayV2Features`/
  `__vantareSet/GetOverlayV2Rollback`/`overlay-v2-rollback-changed` en árbol y
  bundle, con el catálogo estático presente en su archivo; falla antes.
- Aceptación:
  1. Cero maquinaria mutable en árbol y bundle (falsable por `rg`).
  2. Catálogo estático en su archivo distinto, sin mutabilidad ni retorno V1.
  3. Focales en verde.
- Checks: focales, `rg` ausencia, `pnpm --dir frontend typecheck`.
- Reviewer: spec + quality.
- Rollback/stop: revert. **STOP switch/ADR**: si aparece un consumidor que
  exige gating mutable o cambiar capabilities/demand/arquitectura → parar,
  fijar stop condition con ADR; no reintroducir switch de retorno.

### E3 · Borrar 3 JSON overlay/testdata + 2 entrypoints frontend research bench, limpiar bundle

- Hechos de árbol (verificado con `rg`; la frase "bench Go huérfano" queda
  prohibida: ningún Go bench depende de Overlay V1 tras R7a):
  `internal/telemetry/projection/overlay/testdata/` contiene exactamente 3 JSON:
  `lmu-1.4-delta-overlay-v1.golden.json`, `overlay_v1_pre_d7.golden.json`,
  `overlay_v1.golden.json` → DELETE (dueño exclusivo E3).
  `docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts`
  importa `overlay-projection-v1` + `overlay-projection-adapter` (líneas 9-10) →
  DELETE junto a `frontend-bench.mjs` (dueño exclusivo E3). Los Go bench del
  mismo dir usan `strategy/engineer/analysis.ProjectV1` (contratos
  independientes vivos, preservados) y `compact_frame.go` es prototipo
  hipotético sin import V1 (menciona al proyector V1 solo en comentarios) → se
  PRESERVAN como evidencia histórica; se corrigen los comentarios que afirmen
  wiring ejecutable V1, no se borran. Los 4 `sesion-v1-*` y los 2 packages
  harness pertenecen a B3 (dueño exclusivo) y E3 no los toca.
  `vite.config`/`index.html`/`overlay.html`: verificados sin referencias V1 →
  no se tocan salvo que `rg` demuestre lo contrario; E3 solo elimina
  referencias residuales verificadas por `rg`. Evidencia histórica bajo `docs/`
  se conserva siempre.
- Test RED previo: guardia que exige cero referencias productivas a los 3 JSON
  y a los 2 entrypoints; falla si algo los importa.
- Aceptación:
  1. Los 3 JSON y `frontend-bench-entry.ts`/`frontend-bench.mjs` borrados;
     referencias residuales verificadas eliminadas.
  2. Go bench + `compact_frame.go` preservados con comentarios corregidos;
     cero imports productivos restantes a lo borrado.
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
  `docs/telemetry-core/evidence/isa-894/retirada-v1-r7b-frontend-20260904.md`).
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

- Focales RED→GREEN de cada subcorte conductual A–E excepto D5
  (conservación, solo verificación) + contrato generado
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
  genérico / autoridad browser / `Date.now`, o frame @104 que no queda
  < 64 KiB (gate efectivo Publisher; Hub 256 KiB solo secundaria) → parar,
  pedir ADR.
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
