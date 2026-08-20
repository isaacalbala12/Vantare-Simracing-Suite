# 08 — Arquitecturas alternativas (Agente G)

Fecha: 2026-08-19. Autor: Agente G (explorador de arquitecturas alternativas).
Checkout: `C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2`, rama `vantareapp/isa-338-...`, HEAD `08e316c1`, working tree sucio (diff local de *native delta* LMU sin committear).

Este documento no defiende la arquitectura actual ni la simplificada: explora **nueve familias alternativas**, las puntúa con la ponderación fijada por el encargo y termina proponiendo una **Opción D** propia.

Regla de evidencia usada en todo el documento: cada afirmación sobre el código lleva archivo y línea aproximada. Lo que es inferencia mía va marcado como *(inferencia)*. Lo externo lleva URL.

---

## 1. Hechos del código que restringen cualquier diseño

Todo lo siguiente está verificado en este checkout. Es el suelo sobre el que se apoyan las alternativas; una propuesta que no responda a estos hechos es decoración.

| # | Hecho observado | Evidencia | Consecuencia de diseño |
|---|---|---|---|
| H1 | Añadir **una** señal específica de sim tocó **39 archivos, +592/−76** | `git diff --stat` del working tree (catalog, reducer, derive, 5 archivos LMU, proyección overlay, goldens, adaptador TS, view-model, inspector, 4 locales i18n) | La amplificación de cambio, no el rendimiento, es el problema dominante |
| H2 | La ruta LMU→ObservedState exige tocar **10 sitios no-test** en orden fijo | `catalog/ids.go:52`, `catalog/catalog.go:103`, `lmu/layout.go:124,202,248`, `lmu/format.go:58,97,310,447`, `lmu/driver.go:372`, `lmu/fusion.go:31,202,268`, `lmu/batch_mapper.go:299`, `core/reducer.go:40` | Un registro declarativo por señal eliminaría 6 de esos 10 sitios |
| H3 | `fusion.ruleFor` **panica** si falta la regla de matriz de una señal | `lmu/fusion.go:268-332` (`inferredDecision`), `orderDecisions` L252 | La consistencia catálogo↔matriz hoy se paga en runtime, no en compilación |
| H4 | `core.Fanout` (572 líneas) **no tiene ningún consumidor de producción** | `core/fanout.go`; única referencia externa: `derive/fanout_integration_test.go:18` | Código muerto: −572 líneas gratis en cualquier alternativa |
| H5 | `projection/analysis` **no se publica nunca**; sólo tipa el constructor `NewAnalysisFull` | `telemetrytransport/transport.go:22,219`; sin llamadas fuera de tests | Producto fantasma: −132 líneas + su golden |
| H6 | `projection/strategy` **sí** se publica en producción (hub propio) | `telemetry_core_runtime.go:20,192,781,793`; `strategy/live/engine.go:10`; ruta SSE en `server/server.go:232` | La opción "simplificada" se equivoca al retirar Strategy: tiene consumidor real |
| H7 | El **merge patch RFC 7396 nunca se usa** en producción: ambos call sites pasan `nil` | `telemetry_core_runtime.go:789,793`; lógica en `transport.go:369-390` | −116 líneas (`merge_patch.go`) + rama `Delta` del Hub + `merge-patch.ts` frontend |
| H8 | `recording.Coordinator` (448 líneas) **no está cableado**: sólo se usa el lado lectura | Sin llamadas no-test a `NewCoordinator`/`TryAccept`; producción usa `recording/sqlite` vía `diagnostics_bridge.go:17` | La grabación viva sigue siendo diseño, no runtime |
| H9 | Engineer se entrega **fuera del Hub**, por llamada directa | `telemetry_core_runtime.go:686 deliverEngineer` | Ya existen dos mecanismos de entrega distintos conviviendo |
| H10 | Un vehículo del payload overlay ocupa **2 484 bytes** de JSON compacto | medido sobre `projection/overlay/testdata/overlay_v1.golden.json` (2 vehículos, 6 543 B; base 1 560 B) | Coste de transporte lineal y caro: la calidad por campo se paga ×28 campos ×N vehículos |
| H11 | Con parrilla completa el payload **desborda el tope de 256 KiB** | `1 560 + 24 240 (120+120 muestras) + N×2 484 > 262 144` ⇒ falla a partir de **N≈95**; el catálogo declara `ClosedRange(1,104)` para `standings.position` | `PublishSnapshot` devolvería `ErrPayloadTooLarge` y el overlay se congelaría en silencio. Hoy no muerde (LMU real ≈62 coches) pero el margen es del 0,9 % |
| H12 | El frontend gasta **≈3 200 líneas** para pasar de frame JSON a widget | `telemetry-transport/store.ts` 328 + `transports/projection-observer.ts` 257 + `projection-telemetry-adapter.ts` 122 + `overlay-projection-v1.ts` 714 + `overlay-projection-adapter.ts` 640 + `core/telemetry-store.ts` 43, más `telemetry-shadow/overlay-shadow-comparator.ts` 1 132 | El adaptador legacy no es un detalle de migración: es la mitad del frontend de telemetría |
| H13 | El adaptador **destruye la calidad por campo**: `Field{present,value,provenance,freshness}` → `number \| undefined` | `overlay-projection-adapter.ts:540 mappedValue`, `:583 fieldIsUsable` | Los widgets no pueden distinguir *stale* de *fresh*; la calidad va a un array lateral `quality[]` que nadie renderiza |
| H14 | Los widgets leen las filas de standings como `Record<string, unknown>` por clave-string, con **alias defensivos** | `widget-types/shared/scoring-readers.ts` (`readScoringPlace` prueba `place` y luego `position`; `readScoringGap` prueba 3 claves) | El tipado canónico de Go se tira a la basura exactamente donde más falta hace |
| H15 | 10 campos que los widgets quieren están declarados **`unsupported-by-projection`** | `overlay-projection-adapter.ts:60-71` (`environment`, `damage`, `session.globalFlag`, `sectorFlags`, `tireCompound`, `teamName`, `derived.fuelHistory`, …) | `track-weather` y `car-damage-*` (`track-weather-view-model.ts:1`, `shared/damage-reader.ts:1`) están permanentemente en `missing` en la ruta viva |
| H16 | `overlay-projection-v1.ts` es un **espejo manual** de `overlay.VehicleV1`: 28 campos duplicados a mano | `frontend/.../overlay-projection-v1.ts:50-79` vs `projection/overlay/v1.go:61-91` | Ningún compilador vigila esa frontera; sólo un fixture JSON (`typescript_contract_test.go`) vigila las *rutas*, no los campos |
| H17 | `createTelemetryStore().getSnapshot()` **clona en cada lectura** | `core/telemetry-store.ts:24-26` | `useSyncExternalStore` compara con `Object.is`: devolver un objeto nuevo por llamada rompe la premisa de estabilidad referencial de React *(inferencia sobre el efecto; el clon está confirmado)* |
| H18 | El catálogo **ya genera documentación** determinista desde el ledger Go | `catalog/catalog.go:218 Markdown()` | La mitad del "registro generado" ya existe; falta el otro extremo (Go structs + TS) |
| H19 | El coordinador de sesión **ya produce facts ordenados** de 8 tipos | `core/session_coordinator.go:31 FactKind`, `:53 SessionFact`; proyectados en `engineer/v1.go:316-364`; transportados por `FactEnvelope` (`transport.go:104`) y `ServeWailsFacts` (`adapters.go:59`) | La arquitectura híbrida snapshots+facts **ya está construida**, pero sólo para Engineer |
| H20 | La `derive.Pipeline` tiene un registro de derivaciones con orden, inputs, outputs y política de reset — pero **las etapas están fijas en código** | `derive/pipeline.go:82 canonicalRegistry`, `:132 ValidateDefinitions`, `:272-283` (llamadas hardcodeadas) | El registro documenta la dependencia sin ejecutarla: es un contrato validado, no un planificador |

### 1.1 La cadena real, medida

```
LMU SM(60Hz) ─┐
              ├─► format.Parse ─► Observation ─► fusion.Merge ─► BatchMapper ─► Reducer
LMU REST ─────┘   (601 L)         (28 campos)     (483 L)        (359 L)       (278 L)
                                                                                  │
                                                        envelope.Snapshot[ObservedState]
                                                                                  ▼
                                                            derive.Pipeline (426 L) ─► FinalState
                                                                                  │
                        ┌──────────────────┬──────────────────┬──────────────────┴──┐
                        ▼                  ▼                  ▼                     ▼
                  overlay.ProjectV1  strategy.ProjectV1  engineer.ProjectV1   analysis.ProjectV1
                     (316 L)            (161 L)             (385 L)             (132 L)
                        │                  │                  │                     │
                    Hub overlay       Hub strategy      deliverEngineer          ✗ NADIE
                        │                  │             (directo, H9)          (H5)
              ┌─────────┴──────┐           │
          Wails EventsEmit   SSE loopback  …
                        │
            frontend: store.ts → projection-observer → projection-telemetry-adapter
                        │        → overlay-projection-v1 (valida, 714 L)
                        │        → overlay-projection-adapter (aplana, 640 L, PIERDE calidad H13)
                        ▼
              TelemetrySnapshot legacy (54 L, scoring: Record<string,unknown>[])
                        ▼
              20 widget-types × build*ViewModel (leen por clave-string, H14)
```

Dos ramas del diagrama están muertas (`analysis`, `core.Fanout`), una está desconectada (`recording.Coordinator`), y una capacidad del transporte no se ejerce (`delta` RFC 7396).

---

## 2. Criterios y ponderación

| Criterio | Peso | Qué mido concretamente |
|---|---:|---|
| Corrección / fiabilidad | 20 | Ausencia≠cero, freshness explícita, orden, idempotencia ante reconnect, ausencia de caminos que fallen en silencio |
| Extensibilidad multi-sim | 18 | Coste de un sim nuevo con capabilities parciales, sin tocar widgets ni proyecciones existentes |
| Mantenibilidad LLM | 18 | Nº de sitios que un agente debe editar coherentemente **y** si el compilador/test los descubre solo |
| Rendimiento | 15 | Bytes/frame, asignaciones, clones, coste de parseo JS, latencia extremo a extremo |
| Facilidad widgets/señales | 10 | Trabajo real de "añadir un widget" y "añadir una señal a un widget" |
| Testabilidad / observabilidad | 8 | Golden tests, pureza de funciones, diagnóstico de "por qué está vacío" |
| Coste / riesgo de migración | 6 | Desde este HEAD, con tests verdes en cada paso |
| Preparación futura | 5 | Strategy Planner, Telemetry Analysis (DuckDB), recording/replay, Spotter |

---

## 3. Las nueve alternativas

Notación de contratos: Go simplificado; `Field[T]` es `schema.Field[T]` (presencia + provenance + freshness).

---

### A1 — Canonical state + product projections (la actual, bien hecha)

**Descripción.** Se conserva la topología actual y se paga la deuda: borrar `core.Fanout` (H4), borrar `projection/analysis` (H5), borrar el merge patch (H7), cablear `recording.Coordinator` o borrarlo (H8), unificar la entrega de Engineer con el Hub (H9), y retirar el adaptador legacy del frontend (H12/H13) haciendo que los widgets consuman `OverlayProjectionV1` directamente.

```
drivers ─► Observation ─► Reducer ─► ObservedState ─► derive ─► FinalState
                                                                   │
                                    ┌──────────────┬───────────────┴───────┐
                                    ▼              ▼                       ▼
                              overlay.V1     strategy.V1            engineer.V1+Facts
                                    └──────────────┴───────────────────────┘
                                                   ▼
                                         Hub por producto (latest-wins)
                                                   ▼
                                      Wails EventsEmit / SSE loopback
                                                   ▼
                              frontend: decode V1 ─► widgets (SIN adapter legacy)
```

**Contratos.** Sin cambios estructurales: `core.ObservedState`, `derive.FinalState`, `overlay.PayloadV1`, `projection.Field[T]`.

**Problema real que resuelve.** H4, H5, H7, H8, H9 desaparecen por borrado, no por rediseño: ≈1 350 líneas de código no ejercitado fuera del árbol. H12/H13 se resuelven a medias (se quita el aplanado, pero los widgets siguen leyendo `Field` a mano).

**Problema que crea.** No toca H1/H2/H16: la señal nueva sigue costando 10+ sitios en Go y un espejo TS a mano. Consolida la duplicación estructural: `overlay.VehicleV1`, `strategy.PlayerV1`, `engineer` y `analysis` repiten el mismo conjunto de campos con nombres distintos.

**Coste de migración.** Bajo. Borrados + reescritura de los 20 view-models para leer `Field<T>` en vez de `Record<string,unknown>`. Riesgo concentrado en el frontend.

**Comportamiento operativo.** Multi-sim: cada proyección recalcula sus capabilities desde los `Field` presentes (`overlay/v1.go:269 capabilities`) — correcto pero recomputado por frame. Missing/stale: bien modelado, es la mayor fortaleza del diseño. Reconnect: epoch reset validado en `reducer.go:221 validateCursor` y `pipeline.go:367 validateInput`. Suscriptor lento: latest-wins en el Hub, cursor por suscriptor (`transport.go:568 snapshotFor`), correcto.

**Amplificación (ver §4).** Prácticamente idéntica a la actual: 20 / 18 / 39 / 13 / 12.

**Puntuación: 70/100.** (C 88, E 72, M 55, P 62, W 45, T 82, G 92, F 70)

---

### A2 — Canonical state + un único `OverlayFrame`

**Descripción.** Se mantiene el estado canónico y la derivación, pero se colapsan las cuatro proyecciones en **una sola** estructura tipada de presentación. Los productos que no son overlay leen del mismo `FinalState` mediante funciones puras, sin hub propio.

```
drivers ─► Reducer ─► ObservedState ─► derive ─► FinalState (autoridad única)
                                                     │
                            ┌────────────────────────┼────────────────────────┐
                            ▼                        ▼                        ▼
                     BuildOverlayFrame       strategy.Read(FinalState)  engineer.Read(...)
                            ▼                   (en proceso)              (en proceso)
                    OverlayFrame (tipado)
                            ▼
                   un publisher latest-wins ──► Wails + SSE
                            ▼
                    un store frontend ──► widgets
```

**Contratos aproximados.**
```go
type OverlayFrame struct {
    Meta        FrameMeta           `json:"meta"`
    Caps        Capabilities        `json:"caps"`
    Session     SessionView         `json:"session"`
    Player      PlayerView          `json:"player"`
    Standings   []StandingRow       `json:"standings"`
    Relative    []RelativeRow       `json:"relative"`
    Delta       DeltaView           `json:"delta"`
}
```

**Problema real que resuelve.** Elimina la duplicación entre `overlay/v1.go`, `strategy/v1.go`, `engineer/v1.go`, `analysis/v1.go` (≈994 líneas que repiten el mismo conjunto de campos). Un solo golden, un solo espejo TS. Reduce H10/H11 si `OverlayFrame` deja de llevar `provenance`+`freshness` por campo en las filas de standings (los widgets de standings no lo usan: `standings-view-model.ts` sólo lee valores).

**Problema que crea.** Acopla productos con necesidades distintas: Strategy quiere `sourceTimeSeconds` con calidad completa (`strategy/v1.go:43`) y Analysis quiere series densas; forzarlos al frame de overlay o los infla o los deja fuera. Además contradice H6: Strategy hoy tiene runtime propio (`strategy/live/engine.go`) y perdería su contrato.

**Coste de migración.** Medio-alto: reescribir las cuatro proyecciones, el runtime de Strategy y todos los goldens.

**Comportamiento operativo.** Igual que A1 salvo por el suscriptor lento, que mejora: un solo publisher, una sola retención.

**Puntuación: 75/100.** (C 84, E 74, M 78, P 74, W 72, T 78, G 62, F 58)

---

### A3 — Typed signal registry con contratos Go/TypeScript **generados**

**Descripción.** El catálogo declarativo (`internal/telemetry/catalog`) pasa de ser *documentación validada* a ser **la fuente de generación**. Un `go:generate` produce, desde una única tabla: (a) los `SignalID` y sus constantes, (b) los campos de `core.VehicleState`/`ObservedState`, (c) las filas de la matriz de autoridad por driver con exhaustividad **en compilación** (mata H3), (d) el payload de la proyección, (e) los tipos y el decodificador TypeScript, (f) el markdown del catálogo (que ya existe, H18).

```
catalog/signals.go  (ÚNICA declaración: id, key, domain, unit, range, scope, notes)
        │
        │  go generate ./...
        ├────────────► gen/state.go          (VehicleState / ObservedState + clone)
        ├────────────► gen/authority.go      (interfaz por driver: exhaustiva en compilación)
        ├────────────► gen/overlay_payload.go(PayloadV1 + capabilities)
        ├────────────► frontend/src/generated/telemetry.ts  (tipos + decoder + guards)
        └────────────► docs/telemetry-core/signal-catalog.md (ya existe: catalog.Markdown())
```

**Contratos aproximados.**
```go
// ÚNICO sitio editable por señal
{ID: SignalVehicleSteering, Key: "vehicle.steering", Domain: DomainControls,
 Unit: UnitRatio, Range: ClosedRange(-1, 1), Scope: ScopeVehicle,
 Products: overlay|engineer|analysis, Notes: "..."}
```
```ts
// generado, no editable
export type SignalKey = "vehicle.steering" | "controls.throttle" | ...;
export type VehicleView = { steering: Field<number>; throttle: Field<number>; ... };
export function decodeOverlayFrame(raw: unknown): OverlayFrame | DecodeError;
```

**Problema real que resuelve.** Ataca directamente H1, H2, H3, H16. De los 10 sitios de H2, la generación absorbe 6 (ids, catálogo, `VehicleState`, fila de matriz, payload de proyección, tipo TS). Quedan 4 que **no se pueden generar** porque son conocimiento específico del sim: offset en `layout.go`, lectura/validación en `format.go`, envejecimiento en `fusion.ageVehicleGrid`, mapeo en `batch_mapper.mapVehicle`. H3 desaparece: si la matriz se genera con un `switch` exhaustivo sobre el enum, el compilador Go detecta la señal sin regla.

**Problema que crea.** Introduce una etapa de build en un repo que hoy compila con `go build ./...` puro. Un agente LLM que edite el archivo *generado* en vez del declarativo produce un cambio que desaparece en el siguiente `go generate` — es el modo de fallo característico de la codegen con agentes, y sólo se mitiga con cabecera `// Code generated ... DO NOT EDIT.` más un test de CI que regenera y compara. Herramientas 2026 razonables: [tygo](https://github.com/gzuidhof/tygo) (parsea AST Go, conserva comentarios, soporta genéricos 1.18+ — encaja con `Field[T]`), [quicktype](https://quicktype.io/) (vía JSON Schema, peor para genéricos), o un generador propio con `text/template` (≈300 líneas, cero dependencias, control total — preferible aquí *(inferencia)*).

**Coste de migración.** Medio. Se puede hacer incremental: generar primero sólo los TS (mata H16 sin tocar Go), luego la matriz de autoridad (mata H3), luego el estado.

**Comportamiento operativo.** Sin cambios respecto de A1 — la generación es de contratos, no de runtime.

**Puntuación: 80/100.** (C 86, E 84, M 92, P 66, W 74, T 84, G 58, F 78)

---

### A4 — Feature-oriented view-model builders (un builder por widget/feature, en Go)

**Descripción.** El trabajo de decidir *qué se muestra* sube de TypeScript a Go. Cada feature tiene un builder puro `FinalState → VM`, con su capability y su fallback declarados en el mismo archivo. El frontend recibe VMs ya resueltos y sólo pinta.

```
FinalState
   ├─► BuildStandingsVM(FinalState) (StandingsVM, Capability)
   ├─► BuildRelativeVM(FinalState)  (RelativeVM,  Capability)
   ├─► BuildDeltaVM(FinalState)     (DeltaVM,     Capability)   ← elige referencia y fallback AQUÍ
   ├─► BuildPedalsVM(FinalState)    (PedalsVM,    Capability)
   └─► BuildWeatherVM(FinalState)   (WeatherVM,   Capability)   ← devuelve Unsupported en LMU (H15)
              │
              ▼
   OverlayFrame{ vms: map[FeatureID]json.RawMessage, caps: []Capability }
              ▼
   frontend: renderer[featureID](vm)   ← SIN lógica de dominio
```

**Contratos aproximados.**
```go
type FeatureID string

type Builder interface {
    Feature() FeatureID
    Requires() []catalog.SignalID              // capability derivada, no adivinada
    Build(FinalState) (payload any, state CapabilityState)
}

type StandingsVM struct {
    Rows   []StandingRow `json:"rows"`
    Player int           `json:"playerIndex"` // -1 si ausente
}
type StandingRow struct {
    VehicleID  string  `json:"id"`
    Position   int     `json:"pos"`
    Class      string  `json:"cls"`
    Driver     string  `json:"drv"`
    GapLeader  *float64 `json:"gapLeader,omitempty"`  // nil = ausente (no cero)
    InPit      bool    `json:"pit"`
    Stale      bool    `json:"stale,omitempty"`       // calidad AGREGADA por fila, no por campo
}
```

**Problema real que resuelve.** Es la única alternativa que ataca H13, H14 y H15 a la vez. Los `readScoringPlace`/`readScoringGap` con alias defensivos (`scoring-readers.ts`) desaparecen porque el contrato deja de ser `Record<string,unknown>`. Los fallbacks del delta (`delta-view-model.ts:112-118`, que hoy encadena `deltaPreviousLap ?? deltaSessionBest ?? deltaPersonalBest ?? deltaSeconds` en TypeScript, sin tests de integración con el backend) suben a Go, donde `derive/delta.go` ya tiene las tres referencias. Y ataca H10/H11: agregar la calidad por fila en vez de por campo reduce el payload de ~2 484 B/vehículo a ~180 B/fila estimados *(inferencia; el cálculo exacto depende de qué campos conserven `Field` completo)*, es decir **un orden de magnitud**.

**Problema que crea.** Multiplica las superficies Go: 20 widgets ⇒ hasta 20 builders. Mitigable porque los widgets comparten features (los 4 de delta comparten `DeltaVM`; `standings`, `relative`, `multiclass-relative`, `broadcast-tower` y `head-to-head` comparten `StandingsVM`+`RelativeVM`): en la práctica son ~7 builders para 20 widgets. Riesgo real: mezclar *presentación* con *dominio*. El formateo (`"1:23.456"`, i18n, colores) debe quedarse en TS; sólo la **selección y el fallback** suben a Go.

**Coste de migración.** Medio-alto pero **estrictamente incremental**: se puede migrar un builder por vez, dejando el adaptador legacy vivo para los widgets no migrados. `overlay-shadow-comparator.ts` (1 132 L) ya existe justamente para comparar dos rutas — es el andamio de esta migración.

**Comportamiento operativo.** Multi-sim: excelente. Un sim sin weather hace que `BuildWeatherVM` devuelva `CapabilityUnsupported`, el frontend oculta el widget y el resto no se entera. Missing/stale: mejora, porque el fallback está donde están los datos. Reconnect: sin cambios. Suscriptor lento: mejora por tamaño de payload.

**Puntuación: 85/100.** (C 88, E 86, M 88, P 84, W 92, T 90, G 55, F 76)

---

### A5 — Snapshot store con selectors en el frontend

**Descripción.** Se publica un único snapshot canónico serializado y el frontend usa selectors memoizados (`useSyncExternalStore` + `createSelector`) para derivar lo que cada widget necesita.

```
FinalState ─► CanonicalFrame (plano, sin proyección por producto)
                    ▼
            un store inmutable (referencia estable por frame)
                    ▼
      selectStandings ─┐  selectDelta ─┐  selectPedals ─┐   (memoizados)
                       ▼               ▼                ▼
                    widget          widget           widget
```

**Contratos aproximados.**
```ts
const store = createStore<CanonicalFrame>();
const selectStandings = createSelector(
  (f: CanonicalFrame) => f.vehicles,
  (vehicles) => vehicles.map(toRow).sort(byPosition),
);
```

**Problema real que resuelve.** H17 (el clon por lectura de `telemetry-store.ts:24`) y parte de H12: desaparecen `projection-telemetry-adapter` y `overlay-projection-adapter`. Es la respuesta más barata al re-render.

**Problema que crea.** **Deja la lógica de dominio en TypeScript**, que es exactamente donde la evidencia dice que no debe estar (H14: alias defensivos; `delta-view-model.ts`: cadena de fallback sin cobertura de integración). Además no toca H1/H2/H16 y empeora H10: el frame canónico es más grande que la proyección de overlay, porque no filtra nada. Es una optimización de una capa, no una arquitectura.

**Coste de migración.** Bajo. Pero resuelve el problema menos importante.

**Comportamiento operativo.** Suscriptor lento: mejor (menos objetos por frame). Multi-sim: peor — cada widget debe decidir por su cuenta qué hacer sin `spatial`, sin contrato de capability.

**Puntuación: 66/100.** (C 70, E 58, M 60, P 78, W 66, T 62, G 78, F 50)

---

### A6 — Event stream + materialized state (eventos como primario)

**Descripción.** El log de eventos es la fuente de verdad; el estado se materializa reproduciéndolo. Recording deja de ser un sumidero y pasa a ser el sustrato.

```
drivers ─► Event log (append-only, ordenado, persistido)
                 │
        ┌────────┴────────┐
        ▼                 ▼
   materializer      recording/replay/analysis (leen el mismo log)
        ▼
   CanonicalState ─► proyecciones ─► widgets
```

**Problema real que resuelve.** Unificaría replay, historical reader y live (`recording/replay/player.go` 357 L + `historical_reader.go` 752 L + `canonical.go` 171 L reproducen hoy, por separado, lo que el pipeline vivo ya hace). Es la única familia que borra esa duplicación de raíz.

**Problema que crea.** Es una **inversión de costes catastrófica** para este producto. A 60 Hz con 62 vehículos, el log crudo tendría ≈3 700 eventos/s de valores continuos; materializar estado continuo desde eventos es exactamente el caso en el que event sourcing es la herramienta equivocada. El propio dominio ya lo separa bien: `core.SessionFact` (8 tipos, `session_coordinator.go:31`) modela lo **discreto**, y `ObservedState` lo **continuo**. Fusionarlos destruye esa separación correcta. Además obliga a un materializador determinista con versionado de esquema — el peor escenario posible para mantenimiento por LLM.

**Coste de migración.** Muy alto. Reescritura completa.

**Comportamiento operativo.** Reconnect: el mejor de todos (rebobinar el log). Todo lo demás: peor.

**Puntuación: 54/100.** (C 74, E 60, M 38, P 48, W 40, T 66, G 22, F 72)
No la recomiendo. Su única virtud (unificar replay y live) se consigue mucho más barato en A7.

---

### A7 — Híbrida snapshots + facts

**Descripción.** Dos canales con semánticas distintas y explícitas: **snapshots latest-wins** para estado continuo (posición, velocidad, gaps) y **facts ordenados sin coalescing** para ocurrencias discretas (entrada a boxes, cambio de bandera, vuelta completada, incidente). No es una propuesta nueva: **ya está construida y funcionando para Engineer** (H19); la alternativa consiste en generalizarla y en que Overlay también la use.

```
ObservedState ──┬──► derive ──► FinalState ──► snapshots (latest-wins, coalescing OK)
                │                                   │
                └──► SessionCoordinator ──► Facts ──┤ (ordenados, sin coalescing,
                     (session_coordinator.go:128)   │  cursor propio, gap = error)
                                                    ▼
                                             Hub (2 canales)
                                                    ▼
                              Wails: <p>:projection  /  <p>:fact
                              SSE:   ProjectionRoute /  FactsRoute
```

**Contratos aproximados.**
```go
type Fact struct {
    Seq        uint64    `json:"seq"`        // monótono, gap ⇒ error explícito
    Kind       FactKind  `json:"kind"`       // lap.completed | pit.entered | flag.changed | …
    At         string    `json:"at"`
    VehicleID  string    `json:"vehicle,omitempty"`
    Payload    any       `json:"payload,omitempty"`
}
```
```ts
type FactHandler = (fact: Fact) => void;   // el widget se suscribe a lo que le importa
```

**Problema real que resuelve.** El problema que ninguna arquitectura latest-wins puede resolver: **los eventos que ocurren entre dos frames se pierden**. Hoy `derive` compensa con historiales acotados (`ControlsHistory` 120 muestras, `DeltaHistory` 120 muestras) que cuestan 24 240 bytes por frame (H11) para transportar, una y otra vez, lo que un fact transmitiría una sola vez. Sustituir `deltaHistory` y `controlsHistory` por facts elimina ~24 KB/frame y sube el techo de vehículos de ≈95 a ≈105 (H11). Es también la base honesta para Spotter (necesita "te están adelantando por la izquierda" *ahora*, no en el próximo frame) y para Analysis.

**Problema que crea.** Dos canales con dos semánticas de error: el suscriptor lento de snapshots pierde frames por diseño (correcto), pero el de facts **no puede** perder ninguno. `adapters.go:59 ServeWailsFacts` ya implementa la puerta estricta `expected+1`; el modo de fallo (qué hacer cuando un overlay OBS se atasca y rompe la secuencia de facts) hay que decidirlo: la respuesta correcta es *reset + resnapshot*, no *reintento*. Riesgo secundario: la tentación de meter estado continuo en facts.

**Coste de migración.** **Bajo**, y es el hallazgo más importante de este documento: `envelope.Fact` (`schema/envelope/types.go:66`), `core.SessionFact`, `FactEnvelope`, `ServeWailsFacts`, `SSEFactsHandler` y `engineer.ProjectFactV1` ya existen y están testeados. Falta cablear el canal de facts para `ProductOverlay` y añadir el consumidor TS.

**Comportamiento operativo.** Missing/stale: sin cambios (snapshots). Reconnect: mejora — un fact `connection.lost`/`connection.recovered` es explícito en vez de inferido. Suscriptor lento: la política queda **explícita** por canal en lugar de implícita.

**Puntuación: 81/100.** (C 92, E 78, M 76, P 82, W 70, T 84, G 74, F 88)

---

### A8 — Frame ring buffer con cursor para resync *(descubierta)*

**Descripción.** El Hub retiene los últimos N frames en un anillo; un suscriptor que se reconecta pide desde su último cursor y recibe el tramo que falta o, si desbordó, un full.

**Problema real que resuelve.** El síntoma documentado en `transport.go:431-438` y `:559-563`: overlays que se quedan **en blanco** al abrirse con hotkey o al cambiar de diseño porque entran sin snapshot pendiente. El comentario en castellano del propio código dice que `deliveredAny` existe para distinguir "se cerró sin haber recibido nunca nada". El anillo resolvería esa clase de bug de forma estructural.

**Problema que crea.** Retener N frames de ~150 KB es memoria significativa para una app de escritorio con overlays. Y el bug real ya tiene arreglo más barato: `ReplayStatus()` (`transport.go:531`) ya hace exactamente esto para el estado; falta el equivalente para el snapshot — es decir, **retener 1 frame, no N**. El anillo es la versión sobredimensionada de la solución correcta.

**Coste de migración.** Bajo pero innecesario.

**Puntuación: 64/100.** (C 82, E 60, M 54, P 70, W 45, T 70, G 60, F 55)
Se descarta como arquitectura, se **conserva su lección**: `ReplaySnapshot()` simétrico a `ReplayStatus()`.

---

### A9 — Publicación multi-cadencia desde un snapshot inmutable *(descubierta)*

**Descripción.** Un único snapshot inmutable por tick; cada producto/feature decide **a qué cadencia** lo consume, y el publisher sólo serializa lo que cambió de cadencia. Pedales y delta a 60 Hz; standings, combustible y meteo a 4 Hz; sesión a 1 Hz.

```
FinalState (inmutable, 60 Hz)
      │
      ├─ tier FAST  (60 Hz): player controls, delta, rpm/gear/speed   ≈  400 B
      ├─ tier MID   ( 4 Hz): standings rows, relative rows            ≈ 12 KB
      └─ tier SLOW  ( 1 Hz): session, track, weather, capabilities    ≈  1 KB
                    ▼
       un publisher, tres cadencias, cursores independientes
```

**Problema real que resuelve.** Ataca H10/H11 de frente y con evidencia: hoy se serializan 2 484 B por vehículo **60 veces por segundo** para datos que cambian a 2–4 Hz (posición, mejor vuelta, gaps, penalizaciones, clase, nombre). Con 62 vehículos son ≈9,2 MB/s de JSON marshalado, escrito por SSE y parseado en JS. La separación por cadencia lo baja a ≈0,1 MB/s de tier rápido + ≈0,05 MB/s de tier medio: **reducción de ~98 %** *(inferencia aritmética a partir de H10; no medida en runtime)*.

**Problema que crea.** Tres cursores que pueden desincronizarse: un widget puede pintar una posición de hace 250 ms junto a una velocidad actual. Para overlays de simracing esto es aceptable y de hecho ya ocurre (LMU actualiza el scoring a ~5 Hz internamente), pero exige que el contrato lo declare — cada tier lleva su propio `capturedAt`.

**Coste de migración.** Bajo-medio. El Hub ya es latest-wins con cursor por suscriptor; hay que triplicar la retención y separar el `PayloadV1` en tres.

**Puntuación: 78/100.** (C 84, E 72, M 74, P 92, W 62, T 76, G 82, F 76)

---

### Referencia: la opción "simplificada" del encargo (B)

La incluyo puntuada porque es la vara de medir.

**Aciertos verificados.** Retirar RFC 7396 (H7 ✓), retirar `core.Fanout` (H4 ✓), retirar Analysis (H5 ✓), retirar el adaptador legacy (H12/H13 ✓), un solo publisher, un solo store, Engineer por latest-wins + facts ordenados (coincide con A7 y con H19 ✓).

**Error verificado.** "sin Strategy hub sin consumidor" es **falso**: Strategy tiene hub, ruta SSE y runtime propio en producción (H6: `telemetry_core_runtime.go:192,781,793`; `strategy/live/engine.go:10`; `server/server.go:232`). Retirarlo rompería funcionalidad viva. El producto sin consumidor es Analysis, no Strategy.

**Omisión.** No resuelve H1/H2/H16: un `SourceFrame` canónico único no reduce por sí solo los 10 sitios por señal ni el espejo TS manual; los reordena.

**Puntuación: 78/100.** (C 78, E 76, M 86, P 86, W 80, T 74, G 48, F 62)

---

## 4. Amplificación de cambio en los 5 casos

Archivos **de producción** que hay que editar (entre paréntesis, archivos de test y goldens que fallarán). Baseline = arquitectura actual, medida donde ha sido posible.

| Caso | Actual (medido/estimado) | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A9 | **D** |
|---|---|---|---|---|---|---|---|---|---|---|
| **1. Steering universal** (nueva señal en todos los sims) | ~20 (+8) *est.* | 18 (+8) | 14 (+5) | **8 (+2)** | 10 (+4) | 20 (+8) | 16 (+7) | 20 (+8) | 21 (+8) | **8 (+2)** |
| **2. Brake bias opcional** (1 sim, capability) | ~18 (+7) *est.* | 16 (+7) | 13 (+5) | **7 (+2)** | 9 (+3) | 18 (+7) | 15 (+6) | 18 (+7) | 19 (+7) | **7 (+2)** |
| **3. LMU native delta** | **39 archivos, +592/−76** *medido* | 34 | 27 | 16 | 14 | 39 | 33 | 37 | 40 | **13** |
| **4. Widget Speed+RPM+Gear** (señales existentes) | ~13 frontend, 0 backend | 13 | 13 | 12 | **4 frontend + 1 Go** | 13 | 13 | 13 | 13 | **4 + 1** |
| **5. Sim nuevo sin spatial/weather/native delta** | 5 nuevos + ~6 modificados | 5+5 | 5+7 | **5+2** | 5+3 | 5+8 | 8+9 | 5+6 | 5+6 | **5+2** |

Notas de método:
- Caso 3 es el único **medido** (`git diff --stat`, H1). Los demás son estimaciones por conteo de sitios verificados (H2, H16, `widget-registry.ts`, `widget-definition.ts:10-30`, i18n ×4).
- Caso 4 en la arquitectura actual: `widget-types/X/{definition,view-model,renderer}.tsx`, `widget-registry.ts:1-21`, `profile-document.ts` (`WidgetType`), `widget-definition.ts:10` (`WIDGET_REQUIRED_FEATURE_BY_TYPE`), 4 locales i18n, tests. Con A4 el widget nuevo sólo necesita renderer + registro porque el `PedalsVM`/`ControlsVM` ya existe en Go.
- Caso 5 en A3/D baja a "+2" porque las capabilities y el rechazo de señales ausentes se generan desde el catálogo con el `Scope`/`Products` de cada señal, en vez de escribirse a mano en cuatro proyecciones.

---

## 5. Comportamiento operativo comparado

| Escenario | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A9 | **D** |
|---|---|---|---|---|---|---|---|---|---|
| **Multi-sim, capability ausente** | Recalculada por frame desde `Field` presentes (`overlay/v1.go:269`) | Igual, un solo sitio | Generada desde catálogo, exhaustiva | Declarada por builder (`Requires()`) | Cada widget decide solo ⚠ | Materializador debe saberlo ⚠ | Igual que A1 | Igual que A1 | Declarada por builder + verificada por catálogo ✔ |
| **Señal missing** | `Field.present=false` ✔ | ✔ | ✔ | Builder devuelve `Unsupported` ✔ | Widget ve `undefined` ⚠ | ✔ | ✔ | ✔ | ✔ |
| **Señal stale** | `Freshness` explícita, pero **se pierde en el adaptador** (H13) ✘ | ✔ si se retira el adapter | ✔ | Agregada por fila, llega al widget ✔ | ✘ (se pierde) | ✔ | ✔ | ✔ por tier | ✔ |
| **Reconnect / epoch reset** | Validado en 2 sitios (`reducer.go:221`, `pipeline.go:367`) ✔ | ✔ | ✔ | ✔ | ✔ | Mejor (rebobinado) ✔✔ | Fact `connection.recovered` explícito ✔✔ | 3 cursores a resetear ⚠ | Fact explícito + reset de 3 tiers ✔ |
| **Overlay que abre a mitad de sesión** | ⚠ bug conocido, `ReplayStatus` sólo cubre estado (`transport.go:531`) | ⚠ igual | ⚠ igual | ⚠ igual | ⚠ igual | ✔ | ⚠ igual | ⚠ igual | ✔ `ReplaySnapshot()` simétrico (lección de A8) |
| **Suscriptor lento (OBS atascado)** | latest-wins + cursor por suscriptor ✔ | ✔✔ un solo publisher | ✔ | ✔ payload 10× menor | ✔ | ✘ el log no puede coalescer | Snapshots coalescen; facts **no pueden** ⚠ política explícita | ✔✔ tier lento no penaliza al rápido | ✔✔ |
| **Parrilla de 104 coches** | **falla a N≈95** (H11) ✘ | ⚠ mejora si se aligeran las filas | ✘ igual | ✔ ~10× margen | ✘ igual | ✘ | ✔ (−24 KB de historiales) | ✔✔ | ✔✔ |

---

## 6. Tabla de puntuaciones

| Alternativa | Corr. 20 | Ext. 18 | LLM 18 | Rend. 15 | Widg. 10 | Test 8 | Migr. 6 | Fut. 5 | **Total** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A1 Canonical + proyecciones (actual bien hecha) | 88 | 72 | 55 | 62 | 45 | 82 | 92 | 70 | **70** |
| A2 Canonical + único OverlayFrame | 84 | 74 | 78 | 74 | 72 | 78 | 62 | 58 | **75** |
| A3 Registro tipado con contratos generados | 86 | 84 | 92 | 66 | 74 | 84 | 58 | 78 | **80** |
| A4 View-model builders por feature (Go) | 88 | 86 | 88 | 84 | 92 | 90 | 55 | 76 | **85** |
| A5 Snapshot store + selectors | 70 | 58 | 60 | 78 | 66 | 62 | 78 | 50 | **66** |
| A6 Event stream + materialized state | 74 | 60 | 38 | 48 | 40 | 66 | 22 | 72 | **54** |
| A7 Híbrida snapshots + facts | 92 | 78 | 76 | 82 | 70 | 84 | 74 | 88 | **81** |
| A8 Ring buffer + cursor de resync | 82 | 60 | 54 | 70 | 45 | 70 | 60 | 55 | **64** |
| A9 Multi-cadencia desde snapshot inmutable | 84 | 72 | 74 | 92 | 62 | 76 | 82 | 76 | **78** |
| B "Simplificada" (referencia del encargo) | 78 | 76 | 86 | 86 | 80 | 74 | 48 | 62 | **78** |
| **D — propuesta de este documento** | **92** | **90** | **92** | **90** | **94** | **90** | 60 | **88** | **89** |

Honestidad sobre las notas: D gana en todo menos en coste de migración, donde es la peor de las razonables (60 frente a 92 de A1). Es una crítica legítima y la respondo en §7.4 con un plan por fases donde **cada fase es entregable y reversible por separado**.

---

## 7. Opción D — *Canonical state + catálogo generado + view-model builders + facts + tiers*

No es una arquitectura nueva. Es la **composición coherente de A3 + A4 + A7 + A9 sobre el núcleo canónico que ya existe y funciona** (A1), más las cuatro amputaciones que el código pide a gritos (H4, H5, H7, y Analysis).

La tesis: el núcleo canónico de Vantare (`schema.Field`, `Reducer`, `derive`, ordenación por epoch/sequence) es **bueno y hay que conservarlo íntegro**. Todo el dolor medido (H1, H12, H13, H14, H16) está en los **bordes**: la entrada por señal (10 sitios manuales) y la salida hacia widgets (3 200 líneas que destruyen el tipado). D reemplaza los dos bordes y no toca el centro.

### 7.1 Diagrama exacto

```
┌─────────────────────── DECLARACIÓN (única fuente editable) ────────────────────────┐
│  internal/telemetry/catalog/signals.go                                             │
│    { ID, Key, Domain, Unit, Range, Scope, Products, Notes }   ← 1 línea por señal   │
└───────────────────────────────────┬────────────────────────────────────────────────┘
                                    │ go generate ./...        (A3)
        ┌───────────────────┬───────┴────────┬──────────────────┬─────────────────┐
        ▼                   ▼                ▼                  ▼                 ▼
 gen/state.go        gen/authority.go   gen/caps.go   frontend/src/generated/  docs/…md
 (VehicleState,      (interfaz por      (Capabilities)  telemetry.ts            (ya existe:
  ObservedState,      driver: switch                    (tipos + decoder)        catalog.
  clone)              EXHAUSTIVO ⇒ mata H3)                                      Markdown())

┌──────────────────────────── RUNTIME (núcleo intacto) ──────────────────────────────┐
│                                                                                    │
│  SimDriver ──► SourceFrame ──► Fusion ──► BatchMapper ──► Reducer ──► ObservedState │
│  (LMU: SM+REST)                (autoridad   (identidad,   (single-      (canónico)  │
│   iRacing / ACC…)               por campo)   cursores)     writer)          │       │
│                                                                             ▼       │
│                                                       ┌── derive.Pipeline ─────┐    │
│                                                       │  (gaps, delta, remain) │    │
│                                                       └──────────┬─────────────┘    │
│                                                                  ▼                  │
│                                                            FinalState               │
│                                                                  │                  │
│              ┌───────────────────────────────────────────────────┼───────────┐      │
│              ▼ (A4)                                              ▼           ▼      │
│      ViewModelBuilders                              SessionCoordinator   strategy.  │
│   ┌──────────────────────────┐                      (ya existe: 8 facts)  Read()    │
│   │ StandingsVM  RelativeVM  │                              │             (H6: se   │
│   │ DeltaVM      ControlsVM  │                              │              conserva)│
│   │ FuelVM       SessionVM   │                              │                       │
│   │ WeatherVM(→Unsupported)  │                              │                       │
│   └──────────┬───────────────┘                              │                       │
│              ▼                                              ▼                       │
│      OverlayFrame en 3 tiers (A9)                     Fact stream (A7)              │
│      FAST 60Hz  MID 4Hz  SLOW 1Hz                     ordenado, sin coalescing      │
│              └──────────────────┬──────────────────────────┘                        │
│                                 ▼                                                   │
│                     UN publisher (Hub) — latest-wins por tier                       │
│                     + ReplayStatus() + ReplaySnapshot()  (lección de A8)             │
└─────────────────────────────────┬──────────────────────────────────────────────────┘
                                  ▼
              Wails EventsEmit  ·  SSE loopback  (mismo contrato, mismo decoder)
                                  ▼
┌──────────────────────────── FRONTEND (sin dominio) ────────────────────────────────┐
│   decodeOverlayFrame() [GENERADO]  ──►  un store inmutable (referencia estable)     │
│                                          ├─ vms.standings ──► StandingsRenderer     │
│                                          ├─ vms.delta     ──► DeltaRenderer  ×4     │
│                                          ├─ vms.controls  ──► PedalsRenderer ×3     │
│                                          └─ facts         ──► SpotterRenderer       │
│   Los renderers SOLO formatean (i18n, colores, layout). Cero fallbacks de dominio.  │
└────────────────────────────────────────────────────────────────────────────────────┘

ELIMINADO respecto de HEAD:
  core.Fanout (572 L, H4) · projection/analysis (132 L, H5) · merge_patch.go (116 L, H7)
  merge-patch.ts (30 L) · overlay-projection-adapter.ts (640 L, H13)
  telemetry-snapshot.ts legacy (54 L) · scoring-readers.ts (H14)
  overlay-shadow-comparator.ts (1 132 L, andamio de migración: se retira al final)
  ≈ 2 676 líneas
```

### 7.2 Contratos aproximados

```go
// ─────────────── Driver ───────────────
type SimDriver interface {
    ID() SimID                                   // "lmu" | "iracing" | "acc" | "ac-evo"
    Detect(context.Context) (Availability, error)
    Capabilities() Capabilities                  // ESTÁTICO: lo que el sim puede dar
    Run(context.Context, SourceSink) error       // bloqueante hasta cancelación
    Runtime() RuntimeSnapshot
}

// SourceFrame: lo que un driver emite. Un mapa denso indexado por SignalID generado,
// no un struct por sim. Las señales que el sim no tiene simplemente no se escriben.
type SourceFrame struct {
    Sim        SimID
    ReceivedAt time.Time
    Session    SignalSet                 // ámbito sesión
    Vehicles   []VehicleSignals          // ámbito vehículo
    Diagnostics []FieldDecision          // autoridad por campo (se conserva de fusion.go)
}
type SignalSet struct{ values [catalog.SignalCount]schema.Field[Value] } // generado

// ─────────────── Estado canónico (GENERADO desde el catálogo) ───────────────
type CanonicalState struct {          // == core.ObservedState de hoy, generado
    SourceTime  schema.Field[time.Duration]
    SessionType schema.Field[session.Type]
    // …un campo por señal de Scope=Session
    Vehicles []VehicleState            // …un campo por señal de Scope=Vehicle
}

// ─────────────── Capabilities ───────────────
type CapabilityState uint8 // Unknown | Supported | Unsupported | Degraded  (ya existe:
                           // projection/engineer/contract.go:27 — se promueve a transversal)
type Capabilities struct{ byFeature map[FeatureID]CapabilityState }

func (c Capabilities) State(FeatureID) CapabilityState   // Unknown ≠ Unsupported
func DeriveCapabilities(sim Capabilities, state CanonicalState) Capabilities
// regla: Supported ⟺ el sim lo declara Y hay al menos un Field presente y no-invalid

// ─────────────── SignalState (lo que ve un builder) ───────────────
type SignalState[T comparable] struct {   // == schema.Field[T], sin cambios
    value      T
    present    bool
    provenance Provenance   // observed | derived | estimated | unknown
    freshness  Freshness    // fresh | stale | invalid | missing
}

// ─────────────── View-model builders ───────────────
type FeatureID string
const (
    FeatureStandings FeatureID = "standings"
    FeatureRelative  FeatureID = "relative"
    FeatureDelta     FeatureID = "delta"
    FeatureControls  FeatureID = "controls"
    FeatureFuel      FeatureID = "fuel"
    FeatureWeather   FeatureID = "weather"
    FeatureDamage    FeatureID = "damage"
)

type Builder interface {
    Feature() FeatureID
    Tier() Tier                                   // Fast | Mid | Slow
    Requires() []catalog.SignalID                 // verificable contra el catálogo en test
    Build(FinalState, Capabilities) (any, CapabilityState)
}

// ─────────────── OverlayFrame por tiers ───────────────
type Tier uint8; const (TierFast Tier = iota; TierMid; TierSlow)

type OverlayFrame struct {
    Meta  FrameMeta                          `json:"meta"`   // epoch, seq, tier, capturedAt
    Caps  map[FeatureID]CapabilityState      `json:"caps"`
    VMs   map[FeatureID]json.RawMessage      `json:"vms"`    // sólo las de este tier
}

type StandingRow struct {                    // TierMid
    ID        string   `json:"id"`
    Pos       int      `json:"pos"`
    Class     string   `json:"cls,omitempty"`
    Driver    string   `json:"drv,omitempty"`
    Laps      int      `json:"laps"`
    GapLeader *float64 `json:"gapL,omitempty"`   // nil = ausente, NUNCA 0
    BestLap   *float64 `json:"best,omitempty"`
    LastLap   *float64 `json:"last,omitempty"`
    InPit     bool     `json:"pit,omitempty"`
    IsPlayer  bool     `json:"me,omitempty"`
    Stale     bool     `json:"stale,omitempty"`  // calidad AGREGADA por fila (H10/H11)
}

type RelativeRow struct {                    // TierMid
    ID     string  `json:"id"`
    Pos    int     `json:"pos"`
    Class  string  `json:"cls,omitempty"`
    Driver string  `json:"drv,omitempty"`
    Gap    float64 `json:"gap"`              // firmado: <0 delante, >0 detrás
    LapDif int     `json:"lapd,omitempty"`
    InPit  bool    `json:"pit,omitempty"`
}

type DeltaView struct {                      // TierFast
    Seconds   *float64 `json:"s,omitempty"`   // nil ⇒ el widget muestra "—"
    Reference string   `json:"ref"`           // "personal-best"|"session-best"|"previous-lap"|"native"
    Source    string   `json:"src"`           // "sim-native" | "vantare-derived"
    Fallback  bool     `json:"fb,omitempty"`  // true si la referencia pedida no estaba
    Stale     bool     `json:"stale,omitempty"`
}

// ─────────────── Facts ───────────────
type Fact struct {
    Seq     uint64    `json:"seq"`            // monótono; gap ⇒ error, no reintento
    Kind    FactKind  `json:"kind"`
    At      string    `json:"at"`
    Vehicle string    `json:"veh,omitempty"`
    Data    any       `json:"data,omitempty"`
}
// FactKind ya existe con 8 valores (core/session_coordinator.go:31); se amplía con
// flag.changed, incident.detected, overtake.imminent (Spotter) según haya evidencia.
```

```ts
// ─────────────── Contrato TypeScript (GENERADO — DO NOT EDIT) ───────────────
export type CapabilityState = "unknown" | "supported" | "unsupported" | "degraded";
export type FeatureId = "standings" | "relative" | "delta" | "controls" | "fuel"
                      | "weather" | "damage";
export type Tier = "fast" | "mid" | "slow";

export type OverlayFrame = Readonly<{
  meta: Readonly<{ epoch: number; seq: number; tier: Tier; capturedAt: string }>;
  caps: Readonly<Record<FeatureId, CapabilityState>>;
  vms: Readonly<Partial<Record<FeatureId, unknown>>>;
}>;

export type StandingRow = Readonly<{
  id: string; pos: number; cls?: string; drv?: string; laps: number;
  gapL?: number; best?: number; last?: number; pit?: boolean; me?: boolean; stale?: boolean;
}>;
export type DeltaView = Readonly<{
  s?: number; ref: string; src: "sim-native" | "vantare-derived";
  fb?: boolean; stale?: boolean;
}>;
export type Fact = Readonly<{ seq: number; kind: string; at: string; veh?: string; data?: unknown }>;

export function decodeOverlayFrame(raw: unknown): OverlayFrame | DecodeError;
export function decodeFact(raw: unknown): Fact | DecodeError;
```

### 7.3 Demostración: añadir un simulador hipotético

Sim **"ACC EVO"**: da controles, standings, combustible y meteo; **no** da `spatial.position/orientation/local_velocity`, **no** da delta nativo, y da `standings.lap_distance` sólo del jugador.

**Archivos nuevos (5):**

| Archivo | Contenido | Líneas est. |
|---|---|---|
| `internal/telemetry/drivers/accevo/driver.go` | `SimDriver`: detección, ciclo de vida, poll | ~180 |
| `internal/telemetry/drivers/accevo/layout.go` | Allowlist de offsets de su shared memory | ~120 |
| `internal/telemetry/drivers/accevo/format.go` | Bytes → `SourceFrame`; escribe **sólo** las señales que el sim tiene | ~250 |
| `internal/telemetry/drivers/accevo/capabilities.go` | `Capabilities()` estático: declara `weather: Supported`, `spatial: Unsupported`, `delta-native: Unsupported` | ~40 |
| `internal/telemetry/drivers/accevo/*_test.go` | Golden desde captura + test de contrato | ~300 |

**Archivos modificados (2):**

| Archivo | Cambio |
|---|---|
| `internal/telemetry/core/driver_manager.go` | Una entrada en la lista de `DriverCandidate` (`driver_manager.go:26`) |
| `internal/telemetry/drivers/registry.go` | Un `register(accevo.New)` |

**Lo que NO hay que tocar, y por qué:**

- **`catalog/signals.go`**: cero cambios. ACC EVO no aporta ninguna señal conceptual nueva. Si aportara una (p. ej. `energy.virtual_energy`), sería **una línea** en la declaración y el resto se genera (A3).
- **`gen/authority.go`**: la generación produce una interfaz `AuthorityMatrix` por driver con un método por señal; un driver que no declara una señal recibe la implementación por defecto `NotProduced`. **El compilador Go verifica la exhaustividad**, de modo que el panic de `fusion.ruleFor` (H3) es imposible por construcción.
- **`core/reducer.go`, `derive/*`**: cero. Trabajan sobre `CanonicalState` generado, que es independiente del sim.
- **Los 7 builders**: cero.
- **Los 20 widgets**: cero.
- **`overlay-projection-v1.ts` / adaptador**: no existen ya.

**Comportamiento resultante, feature por feature:**

| Feature | Capability con ACC EVO | Qué hace el builder | Qué ve el usuario |
|---|---|---|---|
| `controls` | `Supported` | `ControlsVM` normal | Pedales funcionan |
| `standings` | `Supported` | `StandingsVM` con `gapL` desde el sim | Standings completos |
| `relative` | **`Degraded`** | Falta `lap_distance` de los rivales ⇒ el builder ordena por posición y `gap` desde `timeBehindLeader`, y marca `Degraded` | El widget de relative se pinta con un indicador de precisión reducida, no se oculta |
| `weather` | `Supported` | `WeatherVM` con datos reales | **`track-weather` deja de estar en `missing` por primera vez** (compárese con H15 en LMU) |
| `delta` | `Supported`, `src: "vantare-derived"` | El builder pide delta nativo, no lo hay, y **cae a la derivación propia** (`derive/delta.go`, que sólo necesita `lap_number` + `lap_distance` + `source_time` del jugador) y pone `fb: true` | El delta funciona; el widget puede mostrar un matiz visual de "derivado" si quiere |
| `damage` | `Unknown` | Ningún builder lo cubre todavía | Widget oculto, sin error |
| `spatial` (track map futuro) | `Unsupported` | Builder devuelve `Unsupported` | Widget oculto; **Spotter desactiva** los avisos posicionales y conserva los de bandera y boxes, que vienen de facts |

**Fallbacks concretos exigidos:**

- **Delta**: `DeltaVM.Build` prueba, en orden: (1) `session.native_delta_best` si `Capabilities.State("delta-native") == Supported`; (2) `derive.SelfDelta.PersonalBest`; (3) `SessionBest`; (4) `PreviousLap`; (5) `Unsupported`. Hoy esta cadena vive en TypeScript (`delta-view-model.ts:112-118`) **sin ningún test que la ejerza contra el backend**; en D vive junto a `derive/delta.go` y su golden.
- **Spotter**: consume el canal de facts. `pit.entered`, `pit.exited`, `lap.completed`, `flag.changed` funcionan en cualquier sim porque salen de `SessionCoordinator` sobre `CanonicalState`. Los avisos que requieren `spatial` se apagan por capability, no por excepción.

### 7.4 Plan de migración por fases (cada fase entregable y verde por separado)

| Fase | Contenido | Reversible | Riesgo |
|---|---|---|---|
| **0** | Borrar `core.Fanout`, `projection/analysis`, `merge_patch.go` (Go y TS). H4+H5+H7 | Sí (revert) | Nulo: nada de eso se ejecuta |
| **1** | Generar `frontend/src/generated/telemetry.ts` desde los tipos Go existentes; sustituir el espejo manual (H16). No cambia ningún contrato de red | Sí | Bajo |
| **2** | Generar `gen/authority.go` desde el catálogo ⇒ mata el panic de `fusion.ruleFor` (H3) | Sí | Bajo, cubierto por `fusion_test.go` |
| **3** | Primer builder en Go (`StandingsVM`) + renderer nuevo; `overlay-shadow-comparator.ts` compara ruta vieja y nueva en vivo | Sí, por widget | Medio |
| **4** | Resto de builders (delta, controls, fuel, session, relative, weather) | Sí, por builder | Medio |
| **5** | Retirar `overlay-projection-adapter.ts`, `telemetry-snapshot.ts`, `scoring-readers.ts` y el comparador. −2 000 líneas | No trivial | Medio |
| **6** | Separar el frame en tiers (A9) | Sí | Bajo |
| **7** | Canal de facts para `ProductOverlay` (A7) — la infraestructura ya existe (H19) | Sí | Bajo |
| **8** | Generar `CanonicalState` desde el catálogo | Sí | Medio-alto (es el centro) |

Las fases 0–2 son **puro beneficio sin cambio de contrato de red** y se pueden hacer esta semana. La fase 8, la más invasiva, es la última y es opcional: si nunca se hace, D sigue valiendo ≈84.

---

## 8. Por qué NO elegí las demás

| Alternativa | Motivo de descarte, con evidencia |
|---|---|
| **A1 (actual bien hecha)** | Resuelve las cuatro amputaciones (H4/H5/H7/H8) pero **no toca el problema medido**: el caso 3 seguiría costando ~34 archivos frente a 39. Borrar código muerto es necesario, no suficiente. Además deja intacto el borde que más duele: el adaptador de 640 líneas que destruye la calidad por campo (H13) y los lectores por clave-string (H14). Se **incorpora a D como fase 0**. |
| **A2 (único OverlayFrame)** | Buena intuición sobre la duplicación de las cuatro proyecciones, pero rompe H6: Strategy tiene runtime y hub de producción y necesita `sourceTimeSeconds` con calidad completa que overlay no usa. Forzar un frame único o infla el payload de overlay o mutila Strategy. D consigue el mismo efecto (una sola definición) por generación, sin colapsar productos con necesidades distintas. |
| **A3 (registro generado)** | No descartada: **es la mitad de D**. Sola no basta porque no toca el borde de salida: aunque el TS estuviera generado, los widgets seguirían recibiendo `Field<T>` crudos y decidiendo fallbacks en TypeScript (`delta-view-model.ts:112`). Genera contratos, no decisiones. |
| **A4 (builders)** | No descartada: **es la otra mitad de D**. Sola no basta porque no toca el borde de entrada: los 10 sitios por señal de H2 y el panic de H3 seguirían ahí, y los builders añadirían un 11.º sitio. A3 y A4 se cubren mutuamente los puntos ciegos; por eso van juntas. |
| **A5 (store + selectors)** | Optimiza la capa correcta (H17, el clon por lectura) por el motivo equivocado. Deja la lógica de dominio en TypeScript, que es precisamente donde la evidencia dice que causa daño (alias defensivos de H14, cadena de fallback sin cobertura). Es un parche de rendimiento, no una arquitectura, y su parte útil (store con referencia estable) está incluida en D. |
| **A6 (event sourcing)** | Rechazada con argumento, no por prejuicio. El dominio **ya distingue** correctamente lo continuo (`ObservedState`, 60 Hz) de lo discreto (`SessionFact`, 8 tipos). Materializar 3 700 eventos/s de valores continuos para reconstruir un estado que el reducer ya produce en un paso es invertir el coste. Su única virtud real —unificar live, replay e historical— se obtiene en A7/D a una fracción del coste, porque el mismo `CanonicalState` alimenta ya `recording/replay/canonical.go`. |
| **A7 (híbrida)** | No descartada: **incorporada a D**. No la propongo como arquitectura completa porque **sola no resuelve nada de la amplificación de cambio** (H1/H2): en el caso 3 empeora ligeramente (40 archivos) al añadir un canal más. Es una pieza excelente dentro de un conjunto, no un conjunto. |
| **A8 (ring buffer)** | Sobredimensionada para el bug que la motiva. El síntoma real —overlays en blanco al abrirse a mitad de sesión— está documentado en el propio código (`transport.go:431-438`) y su solución correcta es retener **1** frame y reemitirlo, simétricamente a `ReplayStatus()` (`transport.go:531`), no retener N. Retener N frames de ~150 KB es memoria mal gastada en una app de escritorio. **Su lección se conserva en D** (`ReplaySnapshot()`). |
| **A9 (tiers)** | No descartada: **incorporada a D**. Sola no la propongo porque optimiza el criterio de menor peso relativo frente al problema medido: gana 92/100 en rendimiento pero deja intactos H1, H13, H14 y H16. Además su riesgo (tres cursores desincronizados) sólo se justifica si el resto del diseño ya es sólido. |
| **B (simplificada)** | Buena en lo que amputa y coincide con D en cinco de seis amputaciones. Falla en dos puntos: (a) retirar Strategy es **factualmente incorrecto** (H6); (b) un `SourceFrame` canónico único no reduce los 10 sitios por señal ni el espejo TS manual — los reordena. Su `OverlayFrame` tipado es la idea correcta, pero sin builders sigue siendo un contenedor de `Field` crudos que el frontend tiene que interpretar. |

---

## 9. Limitaciones honestas de esta investigación

1. **No he medido rendimiento en runtime.** Los números de §1 (H10, H11) son medidas exactas sobre goldens y aritmética sobre ellas; la reducción del ~98 % de A9 es una inferencia aritmética, no un benchmark. Corresponde al Agente D validarla.
2. **Las cifras de amplificación de los casos 1, 2, 4 y 5 son estimaciones** por conteo de sitios verificados. Sólo el caso 3 está medido (`git diff --stat`).
3. **No he leído los documentos 01–07** de esta investigación (regla del encargo). Es posible que otro agente haya llegado a conclusiones distintas sobre los mismos hechos; el Agente H debe arbitrar.
4. **El working tree sucio se ha tratado como dato observado**, no como funcionalidad integrada. Si ese diff se descarta, el caso 3 deja de ser evidencia directa y pasa a ser reconstrucción.
5. **El riesgo específico de la generación de código con agentes LLM** (editar el archivo generado en vez del declarativo) es real y no lo he resuelto del todo: la mitigación propuesta (cabecera `DO NOT EDIT` + test de CI que regenera y compara) es estándar pero no infalible. Es el argumento más fuerte contra la parte A3 de mi propuesta y merece una decisión explícita de Isaac.
6. **La fase 8 (generar `CanonicalState`) toca el centro del sistema**, que es la parte que hoy funciona bien. La he puesto la última y marcada como opcional deliberadamente: si genera dudas, D sin fase 8 sigue siendo mejor que la actual y que la simplificada.

**Fuentes externas citadas:** [tygo](https://github.com/gzuidhof/tygo), [quicktype](https://quicktype.io/).
