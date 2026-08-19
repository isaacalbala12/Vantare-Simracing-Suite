# 07 — Mantenibilidad por agentes LLM

Agente F. Fecha: 2026-08-19. Base: `vantareapp/isa-338-retirar-los-ultimos-confirm-nativos`, HEAD `08e316c1`, working tree sucio (diff local de delta nativo **no committeado**).

Alcance: valorar la arquitectura de telemetría **actual**, una **simplificada** y una **híbrida** desde la única perspectiva que importa para este producto: que equipos formados casi solo por agentes LLM, orquestados por un humano que no revisa código línea a línea (`AGENTS.md:7`), puedan desarrollar, depurar y ampliar el sistema sin romperlo en silencio.

Todo dato de este documento está medido sobre el checkout. No se ha modificado ningún archivo del producto.

---

## 0. Resumen ejecutivo

| Hallazgo | Evidencia | Impacto LLM |
|---|---|---|
| 20 saltos y 12 módulos entre el offset de memoria compartida y el píxel | §1.1 | Un agente no puede sostener la cadena completa en contexto; corta por donde la ve |
| 45 archivos tocados para una señal nativa de UN simulador | §4.3, diff local | Amplificación medida ×45; ~53 % es ceremonia estructural |
| `scoring: readonly Record<string, unknown>[]` con 101 lecturas por string | `frontend/src/overlay/core/telemetry-snapshot.ts:39` | 16 claves leídas en producción **no existen** en el adapter; TypeScript no lo detecta |
| `core.Fanout` (572 LOC + 961 LOC de test) sin ningún consumidor productivo | §3.1 | Un agente puede extender el camino muerto creyendo que es el bueno |
| Orden de standings, selección de relative y tono se deciden en el frontend | §2.2 | Autoridad de dominio duplicada fuera de Go |
| `docs/telemetry-core/README.md` afirma que no hay wiring productivo; sí lo hay | §7.2 | La doc obligatoria contradice el runtime |
| `architecture_test.go` (578 LOC) protege dirección de imports, nada más | §3.4 | No hay barrera contra calcular en el widget ni contra el snapshot legacy |
| Ningún golden tiene flag `-update`; 17 goldens y 3 SHA256 se regeneran a mano | §6.2 | Fuente principal de "el agente debilitó el test" |

**Puntuaciones finales** (justificadas en §9.3): actual **8/18** y **4/10**; simplificada **14/18** y **8/10**; híbrida **15/18** y **7/10**.

---

## 1. Capas y saltos que un agente debe recorrer

### 1.1 Caso (a): "¿de dónde sale el número que pinta el widget Delta?"

Cadena real reconstruida leyendo el código, no la documentación. El valor rastreado es el delta nativo de LMU introducido por el diff local.

| # | Salto | Archivo:línea | Representación del dato |
|---|---|---|---|
| 1 | Offset en Shared Memory | `internal/telemetry/drivers/lmu/layout.go:202` `telemetryField("telemetry.delta_best", 696, sourceFloat64, 1)` | `float64` crudo en `[]byte` |
| 2 | Parseo + validez | `drivers/lmu/format.go:359-370` | `schema.Field[session.DeltaSeconds]` |
| 3 | Struct de observación | `drivers/lmu/format.go:125` `DeltaBest` | idem |
| 4 | Matriz de autoridad (fusión SM/REST) | `drivers/lmu/fusion.go:68`, `:235`, `:327` (+ `MatrixVersion 4→5`, `:18`) | idem |
| 5 | Envejecimiento por freshness | `drivers/lmu/driver.go:422` `withFreshness` | idem |
| 6 | Mapper a estado canónico | `drivers/lmu/batch_mapper.go:328` `mapVehicle` | `core.VehicleState.DeltaBest` |
| 7 | Struct canónico | `internal/telemetry/core/reducer.go:68` | idem |
| 8 | Reducer → `ObservedState` | `core/reducer.go` | `core.ObservedState` |
| 9 | Session coordinator (epoch/run/vehículo) | `core/session_coordinator.go` (444 LOC) | `envelope.Snapshot[ObservedState]` |
| 10 | Pipeline de derivaciones | `derive/pipeline.go:245` `Apply` | `derive.FinalState` |
| 11 | Tracker de delta | `derive/delta.go:114-140` | `SelfDelta.PersonalBest` |
| 12 | Proyección de producto | `internal/telemetry/projection/overlay/v1.go:150` | `projection.Field[...]` → JSON `playerDeltaPersonalBestSeconds` |
| 13 | Runtime + hub | `internal/app/telemetry_core_runtime.go:789` `hub.PublishSnapshot` | `telemetrytransport` envelope |
| 14 | Transporte + RFC 7396 | `internal/app/telemetrytransport/transport.go`, `merge_patch.go` | full/delta JSON |
| 15 | Decoder de transporte TS | `frontend/src/telemetry-transport/contracts.ts`, `store.ts` | `JSONObject` opaco |
| 16 | Observer de overlay | `frontend/src/overlay/transports/projection-observer.ts:72` | `OverlayProjectionV1` |
| 17 | Decoder de payload TS | `frontend/src/overlay/projection/overlay-projection-v1.ts:225` | `OverlayProjectionField<number>` |
| 18 | Adapter → snapshot legacy | `frontend/src/overlay/projection/overlay-projection-adapter.ts:248` | `number \| undefined` (se pierde provenance/freshness) |
| 19 | Store React | `frontend/src/overlay/core/telemetry-store.ts:19` | `TelemetrySnapshot` |
| 20 | View-model del widget | `frontend/src/overlay/widget-types/delta/delta-view-model.ts:113` | `string` (`"-0.200"`) |
| 21 | Renderer del design system | `overlay/design-systems/vantare-original/delta/DeltaOriginal.tsx:22` | DOM |

**Medición**: 21 saltos, **18 archivos de producción**, **12 módulos** (6 paquetes Go: `drivers/lmu`, `core`, `derive`, `projection/overlay`, `app`, `app/telemetrytransport`; 6 módulos TS: `telemetry-transport`, `overlay/transports`, `overlay/projection`, `overlay/core`, `overlay/widget-types`, `overlay/design-systems`). **5 representaciones distintas** del mismo escalar y **2 pérdidas de calidad** (paso 18 colapsa `present/provenance/freshness` a `undefined`; paso 20 colapsa a placeholder `"—"`).

Consecuencia para un LLM: para responder "¿por qué el delta sale vacío?" hay que abrir ≥18 archivos en 2 lenguajes. Con ventana de contexto realista el agente inspecciona 3-5 y concluye desde ahí. Es exactamente el patrón que produce parches en la capa equivocada.

### 1.2 Caso (b): añadir una señal universal

Camino canónico obligatorio (medido en §4.1): `layout` → `format` → `fusion` (3 puntos) → `driver` → `batch_mapper` → `catalog/ids` → `catalog/catalog` → `schema/<dominio>` → `core/reducer` → `derive/pipeline` → `projection/<producto>` → goldens → contrato TS → adapter → `telemetry-snapshot.ts` → view-model → i18n. **17 puntos de edición mínimos**, sin contar tests.

### 1.3 Caso (c): añadir un widget

Puntos de registro obligatorios, todos verificados:

| Punto | Archivo | ¿Falla en compilación si se olvida? |
|---|---|---|
| Unión de tipos | `overlay/core/profile-document.ts:16-35` | Sí |
| Array `ALL_WIDGET_TYPES` | `profile-document.ts:40-60` (`satisfies readonly WidgetType[]`) | Sí (`satisfies`) |
| Gate de feature | `overlay/core/widget-definition.ts:10` `Partial<Record<...>>` | **No** — es `Partial`; lanza en runtime (`:35`) |
| Registro | `overlay/core/widget-registry.ts:3-21` | No (import manual) |
| Definición + view-model | `widget-types/<tipo>/*` (2 archivos) | — |
| Renderer × 3 design systems | `design-systems/{vantare-original,vantare-crystal,vantare-endurance}/<tipo>/` | No |
| Manifest × 3 | `design-systems/*/manifest.ts` | Depende del manifest |
| Componentes de hub | `hub/registry/widget-components.ts` | No |
| Panel de Studio | `hub/overlay-studio/components/WidgetListPanel.tsx` | No |
| Perfiles recomendados | `hub/overlays/recommended-profiles.ts` | No |
| Diagnóstico | `hub/settings/diagnostics/contracts.ts` | No |
| Mock scenarios | `overlay/core/mock-scenarios.ts` (473 LOC) | No |
| i18n × 4 idiomas | `i18n/locales/studio-v3/{en,es,it,pt}.ts` | No |

**≈20 archivos**, de los cuales **11 no producen error de compilación si se olvidan**. Para un agente esto es el peor perfil posible: el fallo aparece como widget invisible o texto `overlay.widgets.x` sin traducir, en runtime, en otro producto.

### 1.4 Caso (d): añadir un simulador

`internal/telemetry/drivers/lmu` = **14 archivos de producción, 12.874 LOC totales**. La frontera es correcta y `architecture_test.go:129` prohíbe explícitamente que un driver importe otro (`"concrete driver rejects another simulator"`). Un simulador nuevo debe aportar: `Descriptor`/`Capability` (`internal/telemetry/driver/descriptor.go`), reader, layout/format equivalentes, mapper a `core.VehicleState`, y su propia matriz de autoridad si tiene dos fuentes. **No** tiene que tocar `derive`, `projection` ni el frontend — esto es lo mejor de la arquitectura actual.

El problema es el inverso, y está demostrado por el diff local: **el catálogo canónico y `core.VehicleState` sí se ensucian con señales de un solo simulador**. `catalog.SignalSessionNativeDeltaBest` (`catalog/ids.go:52`) y `core.VehicleState.DeltaBest` (`core/reducer.go:68`) son universales por construcción pero solo LMU los emite. Un segundo sim heredará campos que no puede llenar, y `derive/delta.go:114-140` ya contiene una rama LMU-específica ("LMU has no companion validity flag like iRacing's `LapDeltaToBestLap_OK`", `format.go:366`) dentro de código canónico.

---

## 2. Claridad de autoridad

### 2.1 Autoridades declaradas vs. reales

| Concepto | Autoridad declarada | ¿Hay una segunda? | Evidencia |
|---|---|---|---|
| Delta self | `derive/delta.go` (`selfDeltaTracker`) | **Sí, tres**: nativo del sim (`format.go:359`), reconstruido en Go (`delta.go:479`), e historial recalculado en TS (`overlay/core/derived-telemetry-store.ts:11,58`) | §2.3 |
| Gaps relativos | `derive/gaps.go:45` `deriveRelativeGaps` | Formato y signo reinterpretados en TS: `relative-row-selection.ts:38-46` decide ahead/behind por signo del gap | Sí |
| Standings (orden) | **Ninguna en Go** | Sí: `standings-view-model.ts:67` `sortScoringRows`, `broadcast-tower-view-model.ts:13` y `head-to-head-view-model.ts:12` ordenan por `place` cada uno por su cuenta | Sí |
| Freshness / presencia | `schema.Field[T]` (`schema/quality.go:42-75`) | Se pierde en `overlay-projection-adapter.ts` (todo pasa a `number \| undefined`); los widgets reinventan estados con `snapshot.status` | Sí |
| Unidades | Catálogo (`catalog/catalog.go`, `schema.Unit*`) | El contrato TS no lleva unidad: `playerDeltaSeconds: OverlayProjectionField<number>` la codifica solo en el nombre | Parcial |
| Referencia de delta | `session.DeltaReference` — **un solo valor válido** (`schema/session/*.go:29-32`) | El frontend ofrece **tres** (`delta-definition.ts:8`) | §2.3 |

### 2.2 Autoridad de dominio que vive en el frontend

Verificado en producción (excluyendo tests):

```
frontend/src/overlay/widget-types/relative/relative-row-selection.ts:38-46
  ahead  = gap > 0, orden asc, slice(rangeAhead), reverse()
  behind = gap < 0, orden desc, slice(rangeBehind)
```

Esta es una decisión de dominio (qué coches son relevantes y en qué orden), no de presentación. Vive en TypeScript, sin test de paridad contra Go, y con la convención de signo implícita.

Lo mismo en `standings-view-model.ts:165-178` (orden + filtro de clase + `maxRows`) y `broadcast-tower-view-model.ts:13` (top-10 por `place`).

### 2.3 El caso delta: tres autoridades y una etiqueta mentirosa

El diff local introduce el peor patrón posible para un LLM. En `derive/delta.go:114-140`, `Apply` ejecuta primero la derivación propia (`applySelf`) y después **sobreescribe el resultado completo** con el valor nativo del simulador si está disponible:

```go
return SelfDelta{
    Freshness:    freshness,
    Seconds:      current.DeltaBest,   // nativo LMU sustituye lo derivado
    Reference:    reference,
    ...
}
```

Y en `derive/delta.go:520-530`, `output()` asigna `SessionBest: seconds`, donde `seconds` es el delta contra `tracker.reference` = **mejor vuelta completa del propio jugador**. Es decir: la opción que el usuario ve como `"session-best"` (`delta-definition.ts:8`, `delta-view-model.ts:114-118`) no es el mejor de la sesión de nadie más, es otra vez el mejor personal reconstruido.

Peor: `projection/overlay/v1.go:154-156` sigue emitiendo la referencia como literal fijo para las tres opciones:

```go
DeltaReference: projection.MapField(final.Derived.Delta.Reference, func(reference session.DeltaReference) string {
    return "best-completed-player-lap"
}),
```

Un agente que lea el contrato v1 y vea `playerDeltaReference: "best-completed-player-lap"` concluirá que las tres referencias son la misma. Un agente que lea la UI concluirá que son tres. Ninguna doc reconcilia esto porque el corte no está integrado.

---

## 3. Código desconectado y legacy vivo

### 3.1 `core.Fanout` — 1.533 LOC sin consumidor productivo

```
internal/telemetry/core/fanout.go        572 LOC
internal/telemetry/core/fanout_test.go   961 LOC
```

`NewFanout` aparece únicamente en `core/fanout.go:131`, `core/fanout_test.go` y `derive/fanout_integration_test.go:18`. El runtime real (`internal/app/telemetry_core_runtime.go:185,192`) usa `telemetrytransport.NewHub`, no `Fanout`. **No hay deprecation, comentario de "no usar" ni test que lo impida.** El propio `core/ports.go:2` dice *"This package contains contracts only until the runtime is implemented"* — el runtime lleva implementado desde TC-07C.

Riesgo concreto: un agente al que se le pida "publicar una señal nueva a un consumidor nuevo" encontrará `Fanout` (documentado en `docs/telemetry-core/runtime-fanout.md`, con contrato de backpressure elaborado) antes que el Hub, y construirá encima del camino muerto. Nada se lo impide.

### 3.2 Proyecciones sin consumidor de producto

| Proyección | LOC prod | Consumidor productivo |
|---|---|---|
| `projection/overlay` | 316 | Sí — Studio/Desktop/OBS |
| `projection/engineer` | 1.182 | Sí — `internal/engineer/*` (6 paquetes) |
| `projection/strategy` | 161 | Sí — `internal/strategy/live/engine.go:10` |
| `projection/analysis` | 132 | **No** — solo `telemetrytransport/transport.go:222` conoce el tipo; ninguna pantalla lo consume |

`ProductAnalysis` existe en el transporte (`transport.go:58`), tiene golden (`projection/analysis/testdata/analysis_v1.golden.json`), test de paridad TS (`frontend/src/telemetry-transport/projection-golden.test.ts:18`) y contrato documentado — pero ningún consumidor. Es carga de mantenimiento permanente que ningún agente puede distinguir de una capacidad viva.

### 3.3 `TelemetrySnapshot` legacy: retirado como transporte, vivo como tipo

El frontend hizo un trabajo notable: `overlay/transports/legacy-retirement.test.ts:22-35` prohíbe por texto en todo el TS de producción `telemetry:update`, `/telemetry/stream`, `createWailsTelemetryAdapter`, `normalizeLegacyTelemetry`, etc. Eso es un guardarraíl real y comprobable, y es el mejor mecanismo anti-legacy del repo.

Pero el **tipo** legacy sigue siendo el contrato que ven todos los widgets: `overlay/core/telemetry-snapshot.ts:7-54`. El adapter existe solo para rellenarlo (`overlay-projection-adapter.ts:5` — *"Maps the authoritative projection contract into renderer input only"*), y `UNSUPPORTED_FIELDS` (`:60-70`) documenta 10 campos del tipo legacy que la proyección **no puede llenar nunca**: `session.key`, `session.globalFlag`, `session.sectorFlags`, `scoring[].driverNumber`, `scoring[].teamName`, `scoring[].tireCompound`, `derived.inputHistory`, `derived.fuelHistory`, `environment`, `damage`.

Es decir: el tipo que los widgets tipan describe un mundo que ya no existe.

### 3.4 ¿Qué señales tiene un agente para saber cuál es el camino bueno?

| Mecanismo | Qué protege | Qué NO protege |
|---|---|---|
| `internal/telemetry/architecture_test.go` (578 LOC) | Dirección de imports entre paquetes; replay fuera de producción; sin Wails/SQL/DuckDB en el núcleo | Uso de `Fanout` muerto; cálculo de dominio en el frontend; extender `TelemetrySnapshot` |
| `transports/legacy-retirement.test.ts` | Entrypoints y adapters legacy borrados; strings prohibidos en TS | Tipos legacy; `scoring[]` por strings |
| `catalog/catalog_test.go:163` (`len(All()) != 46`) | Que nadie añada un id sin declararlo | Que el id añadido sea específico de un sim |
| `frontend/.../projection-golden.test.ts` | Que el decoder TS acepte los goldens Go | Que los **campos** del payload coincidan por nombre |
| ESLint (`frontend/eslint.config.js`, **22 líneas**) | Nada relevante: sin `no-restricted-imports`, sin reglas de capa | Todo lo anterior |

Conclusión: la arquitectura tiene **guardarraíles fuertes en una dimensión (imports Go) y ninguno en las dos dimensiones donde un LLM se equivoca de verdad** (dónde se calcula, qué nombres existen).

---

## 4. Change amplification medida

Convención: (P) producción, (T) test, (G) golden, (D) doc.

### 4.1 Caso 1 — Steering angle universal

Punto de partida real: el offset ya es conocido y está **explícitamente excluido** — `drivers/lmu/layout_test.go:223` lo lista como ventana bloqueada: `{Name: "telemetry.filtered_steering", Scope: scopeTelemetryRow, Offset: 436, Type: sourceFloat64, Count: 1}`.

| Capa | Archivos | Notas |
|---|---|---|
| Driver LMU | `layout.go` (3 ediciones: struct, literal, `admittedFields()`), `format.go`, `fusion.go` (3 ediciones + `MatrixVersion 5→6`), `driver.go`, `batch_mapper.go` (P×5) | El campo debe repetirse **9 veces** dentro del driver |
| Tests driver | `layout_test.go` (incl. mover de excluido a admitido), `format_test.go`, `fusion_test.go`, `driver_test.go`, `batch_mapper_test.go` (T×5) | |
| Goldens driver | `driver_to_batch_v1`, `grid_v1`, `menu_track_pit_disconnect_v1` (G×3) | Regeneración manual |
| Contrato canónico | `schema/controls/types.go` (nuevo tipo), `catalog/ids.go`, `catalog/catalog.go`, `catalog/catalog_test.go` (3 tablas + contador) (P×3, T×1) | |
| Núcleo | `core/reducer.go`, `core/reducer_test.go` (P×1, T×1) | |
| Derivaciones | `derive/pipeline.go` si es input de alguna derivación (P×1) | |
| Proyección | `projection/overlay/v1.go` + test + 3 goldens; `projection/engineer/v1.go` si aplica (P×1-2, T×1, G×3) | |
| Replay | `recording/replay/testdata/canonical-integration-v1.golden.json` (G×1) | |
| Contrato TS | `overlay-projection-v1.ts` + test (P×1, T×1) | |
| Puente legacy | `telemetry-snapshot.ts`, `overlay-projection-adapter.ts` + test (P×2, T×1) | |
| Widget | view-model + definición + tests + i18n×4 (P×2, T×2, D×4) | |

**Total ≈ 34-38 archivos, 8 paquetes Go + 5 módulos TS.** Ceremonia dominante: 9 repeticiones del mismo nombre de campo dentro del driver antes de salir de él.

### 4.2 Caso 2 — Brake bias opcional (presente en LMU, ausente en otro sim)

Idéntico al Caso 1 **más** el coste de la opcionalidad, que la arquitectura ya modela bien: `schema.MissingField[T]()` (`schema/quality.go:67`) y `Capability` en la proyección (`projection/overlay/v1.go:28-35`). Un consumidor puede preguntar `Capabilities` en vez de adivinar.

El coste extra real está en el frontend: `TelemetrySnapshot` usa `campo?: number`, que **no distingue "el sim no lo tiene" de "aún no ha llegado" de "es inválido"**. El agente que escriba el widget tendrá que inventar la política, y lo hará distinto en cada widget (compárese `delta-view-model.ts:120` con `delta-advanced-view-model.ts:7`).

**≈36-40 archivos.** El diseño Go de opcionalidad es de los puntos más fuertes del sistema; el frontend lo tira a la basura en un solo salto.

### 4.3 Caso 3 — LMU native delta (**medido sobre el diff local, no estimado**)

`git diff --name-only` = **47 archivos** (45 excluyendo `docs/changelog.md` y `docs/current-plan.md`), +791/−100 líneas. Clasificación por capa y por naturaleza:

| # | Archivo | Capa | Esencial / Ceremonia |
|---|---|---|---|
| 1 | `drivers/lmu/layout.go` | Adquisición | **Esencial** (offset 696 es el hecho nuevo) |
| 2 | `drivers/lmu/format.go` | Adquisición | **Esencial** (parseo + regla de validez sin flag nativo) |
| 3 | `drivers/lmu/fusion.go` | Adquisición | Ceremonia (3 espejos + bump `MatrixVersion 4→5`) |
| 4 | `drivers/lmu/driver.go` | Adquisición | Ceremonia (`withFreshness` es un espejo por campo) |
| 5 | `drivers/lmu/batch_mapper.go` | Adquisición | Ceremonia (copia 1:1 struct→struct) |
| 6-10 | `layout_test.go`, `format_test.go`, `fusion_test.go`, `driver_test.go`, `batch_mapper_test.go` | Adquisición | 2 esenciales (`format`, `layout`) / 3 ceremonia |
| 11 | `drivers/lmu/strategy_signal_audit_test.go` | Adquisición | Ceremonia (auditoría de otro producto) |
| 12 | `drivers/lmu/testdata/menu_track_pit_disconnect_v1.golden.json` | Adquisición | Ceremonia (SHA256 regenerado) |
| 13-15 | `catalog/ids.go`, `catalog/catalog.go`, `catalog/catalog_test.go` | Contrato | Ceremonia (3 tablas + contador `44→46` en `catalog_test.go:163`) |
| 16 | `core/reducer.go` | Núcleo | Ceremonia (campo espejo en `VehicleState`) |
| 17 | `derive/delta.go` | Dominio | **Esencial** (lógica real: nativo vs reconstruido, previous-lap) |
| 18 | `derive/delta_test.go` | Dominio | **Esencial** |
| 19 | `derive/pipeline.go` | Dominio | Ceremonia (`SignalID` string paralela al catálogo) |
| 20 | `projection/overlay/v1.go` | Proyección | **Esencial** (3 campos nuevos del contrato) |
| 21 | `projection/overlay/v1_test.go` | Proyección | **Esencial** |
| 22-23 | `projection/overlay/testdata/{overlay_v1,lmu-1.4-delta-overlay-v1}.golden.json` | Proyección | Ceremonia (regeneración manual) |
| 24 | `recording/replay/testdata/canonical-integration-v1.golden.json` | Replay | Ceremonia (solo cambia un SHA256) |
| 25-26 | `overlay-projection-v1.ts` + test | Contrato TS | **Esencial** |
| 27-28 | `overlay-projection-adapter.ts` + test | Puente legacy | **Ceremonia pura** — existe solo por `TelemetrySnapshot` |
| 29 | `overlay/core/telemetry-snapshot.ts` | Puente legacy | **Ceremonia pura** |
| 30-33 | `widget-types/delta/{delta-definition,delta-view-model}.ts` + tests | Widget | **Esencial** |
| 34-37 | `i18n/locales/studio-v3/{en,es,it,pt}.ts` | UI | **Esencial** (producto multiidioma) |
| 38-39 | `hub/overlay-studio/inspector/{StudioInspector.test.tsx,inspector-sections.test.ts}` | UI | Ceremonia (tests que cuentan opciones del inspector) |
| 40-45 | `docs/telemetry-core/{domain-inventory,lmu-authority-matrix,lmu-overlay-signal-provenance,overlay-shadow-matrix,runtime-derivations,signal-catalog}.md` | Doc | Ceremonia (6 documentos que registran la misma señal) |

**Recuento: 14 esenciales (31 %), 31 ceremonia (69 %).** Paquetes/módulos: **7 Go + 5 TS + 6 docs = 18 unidades de mantenimiento** para una señal que existe en un solo simulador.

El dato más revelador: la misma señal se escribe con **cinco nombres distintos** en la misma cadena — `telemetry.delta_best` (layout), `DeltaBest` (Go struct ×3), `SignalSessionNativeDeltaBest` (catálogo), `observed.session.delta-best` (`derive/pipeline.go:49`), `playerDeltaPersonalBestSeconds` (JSON/TS), `deltaPersonalBestSeconds` (snapshot legacy). Ningún test comprueba que esos cinco nombres se refieran a lo mismo.

### 4.4 Caso 4 — Widget nuevo "Speed + RPM + Gear"

Todos los datos ya existen en la proyección (`projection/overlay/v1.go` → `VehicleV1.speedMps/engineRpm/gear`) y en el snapshot legacy (`telemetry-snapshot.ts:21-23`). **Cero cambios en Go.** Este es el mejor caso de la arquitectura actual.

Coste frontend, según §1.3: **≈20 archivos** (definición, view-model, 2 tests, 3 renderers, 3 manifests, registry, unión de tipos, array, gate de feature, widget-components, WidgetListPanel, recommended-profiles, diagnostics contracts, mock-scenarios, i18n×4). De ellos **11 no rompen la compilación** si el agente los olvida.

Esta es la asimetría clave del sistema: **la parte cara de añadir un widget no es la telemetría, es el registro disperso del frontend**, que no depende en absoluto de la arquitectura de telemetría y que ninguna de las tres arquitecturas evaluadas arregla por sí sola.

### 4.5 Caso 5 — Simulador nuevo sin spatial, sin weather, sin delta nativo

Coste de creación (bien acotado): paquete `drivers/<sim>` con reader, layout, format, mapper y `Descriptor` — orden de magnitud de `drivers/lmu` (14 archivos, ~4-6k LOC de producción sin tests), más registro en `internal/app/telemetry_core_runtime.go:146-149` y `architecture_test.go` (nuevos casos de import).

Coste de ausencias (ahí está el riesgo): las señales que el sim no tiene se quedan como `schema.MissingField`, lo cual el contrato Go maneja bien y la proyección declara vía `Capability`. Pero:

- `core.VehicleState` mantiene `DeltaBest`, `WorldPosition`, `LocalVelocity`, `Orientation` (`core/reducer.go:64-72`) — campos que el sim nuevo dejará vacíos permanentemente sin que nada lo documente.
- `derive/delta.go:114-130` ya arranca por el camino nativo; para el sim nuevo caerá siempre por `applySelf`, ruta menos ejercitada por los goldens actuales (todos los goldens de delta vienen de fixtures LMU).
- El frontend no distingue "sim sin capacidad" de "dato perdido": los tres widgets de delta pintarán `"—"` igual que si el transporte estuviera roto.

**Estimación: 16-20 archivos nuevos + 6-10 modificados**, con el mayor riesgo en tests: no existe una suite parametrizada por simulador. Todo `drivers/lmu/*_test.go` (12.874 LOC totales del paquete) tendría que reescribirse desde cero para el sim nuevo, sin helpers compartidos.

---

## 5. Tipos explícitos vs. abstracciones dinámicas

### 5.1 Lo que está bien tipado (Go)

`schema.Field[T comparable]` (`schema/quality.go:42-75`) es un acierto para agentes: encapsula valor + presencia + provenance + freshness, con constructor que **rechaza** combinaciones inválidas (`ErrMissingValue` si `freshness == FreshnessMissing`, `:56-58`). No hay `any`, no hay reflection: `architecture_test.go:110` prohíbe explícitamente `reflect` en `schema` y `catalog`. Los dominios (`schema/{session,standings,energy,spatial,...}`, 11 subpaquetes) dan tipos nominales (`session.DeltaSeconds`, `standings.LapDistance`) que impiden mezclar unidades por accidente. Esto es lo mejor del sistema para un LLM: es difícil escribir código incorrecto que compile.

### 5.2 Los tres sistemas de identificadores paralelos

| Sistema | Tipo | Ubicación | Sincronizado con los otros por |
|---|---|---|---|
| Catálogo canónico | `SignalID` (`uint`, iota) | `catalog/ids.go` | Nada |
| Derivaciones | `SignalID` (`string`) | `derive/pipeline.go:29-60` (`"observed.session.delta-best"`) | Nada |
| Layout del driver | `Name string` | `drivers/lmu/layout.go:146` (`"telemetry.delta_best"`) | Nada |

Tres vocabularios para las mismas señales, sin ninguna función que los relacione ni test que lo verifique. Un agente que añada un id en uno y no en los otros no verá ningún error salvo el contador de `catalog_test.go:163`.

### 5.3 El agujero: `scoring: readonly Record<string, unknown>[]`

`frontend/src/overlay/core/telemetry-snapshot.ts:39`. Este único campo destruye la seguridad de tipos de toda la cadena en el punto exacto donde los agentes escriben más código.

- **101 llamadas** a `readScoring*` en `widget-types/` (10 archivos de producción).
- Los lectores admiten alias silenciosos: `readScoringPlace` prueba `"place"` y luego `"position"`; `readScoringGap` prueba `"timeGapToPlayer"`, `"timeBehindLeader"` y `"gapSeconds"` (`widget-types/shared/scoring-readers.ts:33-46`).
- **16 claves leídas en producción no las escribe nunca el adapter**: `driverNumber` (4 lecturas), `teamBrandColor` (3), `teamName`, `teamCode`, `team`, `tyreCompound`, `tireCompound`, `number`, `penalties`, `position`, `laps`, `class`, `name`, `gapSeconds`, `pitting`, `inGarageStall`. El adapter solo emite `id, isPlayer, driverName, vehicleClass, place, sector, lapDistanceMeters, lastLapTime, bestLapTime, estimatedLapTime, penaltyCount, timeBehindLeader, lapsBehindLeader, timeBehindNext, lapsBehindNext, timeGapToPlayer, relativeLapDelta, totalLaps, inPits` (`overlay-projection-adapter.ts:380-470`).

Efecto en producción: `broadcast-tower-view-model.ts:13` pinta `number`, `team` y `brandColor` que **siempre** son `"—"` o `undefined`. Y el agente no puede detectarlo, porque:

- TypeScript no marca nada (`Record<string, unknown>` acepta cualquier clave).
- El mock de Studio **sí trae esos campos**: `overlay/core/mock-scenarios.ts:19-21` incluye `driverNumber: "36"`, `teamName: "ALPINE"`. El agente prueba en Studio, ve el widget completo, lo da por bueno, y en carrera real sale vacío.

Esto es, con diferencia, el mayor generador de alucinaciones de nombres de campo del repositorio: hay un **camino completo de verificación que confirma un comportamiento falso**.

### 5.4 Generación de código Go→TS: no existe

Búsqueda exhaustiva: `grep -rn "go:generate" internal cmd` → **0 resultados**. No hay `frontend/wailsjs` bindings generados en el árbol de telemetría. `OverlayPayloadV1` (`overlay-projection-v1.ts:120-130`) se escribe a mano y se mantiene sincronizado con `PayloadV1` (`projection/overlay/v1.go:44-58`) por disciplina humana.

El sustituto es bueno pero incompleto: los tests TS **leen los goldens de Go directamente desde el árbol Go** —

```ts
path.resolve(process.cwd(), `../internal/telemetry/projection/overlay/testdata/${fileName}`)
```
`frontend/src/overlay/projection/overlay-projection-adapter.test.ts:522-527`

— lo cual impide que TS invente un esquema paralelo. Es un patrón excelente y debería mantenerse en cualquier arquitectura futura.

Pero el decoder degrada en silencio: `decodeOptionalField` (`overlay-projection-v1.ts:409-418`) devuelve `missingField(...)` si la clave no existe. Si Go renombra un tag JSON y **el golden se regenera**, el test TS que solo comprueba `event.value.payload` sigue pasando y el campo se vuelve `present: false` para siempre. La detección depende de que exista una aserción explícita sobre ese campo concreto.

---

## 6. Facilidad de generar tests

### 6.1 Lo que existe

| Recurso | Cantidad | Valor para un agente |
|---|---|---|
| Tests Go en telemetría | 69 archivos, **22.715 LOC** (ratio 1,28:1 frente a 17.734 LOC de producción) | Alto: casi cualquier cambio tiene un test cercano que copiar |
| Goldens | 17 `.golden.json` | Alto para regresión, alto coste de actualización |
| Test de arquitectura | `architecture_test.go` (578 LOC, tabla de 50+ casos) | Muy alto: es el mejor documento ejecutable del repo |
| Integración buffer→proyección | `drivers/lmu/runtime_integration_test.go` (fixtures reales + SHA256 de la proyección) | Muy alto: es el único test end-to-end real del backend |
| Paridad Go↔TS | `frontend/src/telemetry-transport/projection-golden.test.ts` (4 productos) | Alto |
| Tests frontend overlay | 143 archivos `.test.ts(x)` | Alto |

### 6.2 Fricciones concretas

1. **Ningún golden tiene mecanismo de actualización.** `grep -rn "UPDATE\|update-golden\|GOLDEN" --include=*_test.go internal/telemetry` no devuelve ningún flag. Los 17 goldens y los SHA256 embebidos (`runtime_integration_test.go`, `trackOverlayProjectionSha256`) se actualizan copiando a mano el valor del fallo. Es el escenario clásico en que un agente "arregla" el test pegando el valor observado sin entender si el cambio era correcto — exactamente lo que `AGENTS.md:79` prohíbe y no hay nada que lo detecte.
2. **`overlay_v1.golden.json` es una sola línea JSON de ~6 KB.** Un diff sobre él es ilegible para revisión humana y para el propio agente; el diff local muestra `-1/+1` líneas ocultando 3 campos nuevos.
3. **No hay test end-to-end buffer→widget.** El backend llega hasta la proyección (`runtime_integration_test.go`); el frontend arranca desde el golden (`overlay-projection-adapter.test.ts:509`). El eslabón `Hub → transporte → store` no está cubierto por ningún test que atraviese los dos lenguajes en un solo flujo. Para "¿mi señal nueva llega al widget?" un agente necesita escribir dos tests en dos lenguajes y confiar en que el golden compartido los une.
4. **No hay helpers para construir un `ObservedState` de prueba.** `drivers/lmu` tiene su propio andamiaje; `derive` construye estados a mano en cada test. Un test de "señal nueva llega hasta el view-model" cuesta hoy ≈4 archivos y ≈150-250 líneas de boilerplate.

---

## 7. Documentación necesaria

### 7.1 Volumen de lectura obligatoria

`AGENTS.md:19-28` impone antes de interpretar cualquier tarea:

| Documento | Líneas |
|---|---|
| `AGENTS.md` | 199 |
| `docs/current-plan.md` | **5.463** |
| `docs/agent-workflow.md` | 210 |
| `docs/branch-channels.md` | 123 |
| `docs/vantare-program/*.md` | 425 |
| **Subtotal proceso** | **≈6.420** |
| `docs/telemetry-core/*.md` (≈45 archivos) | **6.696** |
| ADR 0004 + `docs/architecture.md` + `docs/go-review-checklist.md` | 314 |
| **Total para tocar telemetría con seguridad** | **≈13.400 líneas** |

Ese volumen no cabe en una sesión útil junto con el código. En la práctica el agente lee 2-4 documentos y opera con un modelo mental parcial. La documentación no es escasa: es **demasiada, no jerarquizada y no co-localizada** con el código que describe.

### 7.2 Contradicciones documentadas contra el wiring real

| Doc | Afirmación | Realidad en el código |
|---|---|---|
| `docs/telemetry-core/README.md:12` | *"todavía no existe wiring productivo global"* | `internal/app/telemetry_core_runtime.go` (865 LOC) publica a dos Hubs en producción desde TC-07C |
| `docs/telemetry-core/runtime-fanout.md:3` | *"implementación aislada sin wiring productivo"* — describe `core.Fanout` como el distribuidor del runtime | El runtime usa `telemetrytransport.Hub`; `Fanout` no tiene consumidor productivo (§3.1). La doc no dice que fue superado |
| `docs/telemetry-core/typescript-projection-contract.md:83` | *"No hay wiring productivo ni migración de las pantallas legacy en este corte"* | `tc-07c-overlay-cutover.md:3` dice lo contrario: *"Overlay Projection v1 es la única fuente productiva para Studio, Desktop y OBS"* |
| `internal/telemetry/core/ports.go:2` | *"contains contracts only until the runtime is implemented"* | El runtime está implementado |

Estos documentos no están *mal*: son actas de un corte histórico que nadie marcó como superadas. Un humano infiere la cronología por los prefijos `TC-05C`, `TC-07C`. Un agente que hace `grep fanout docs/` no la infiere. `AGENTS.md:77` prohíbe borrar documentación obsoleta sin preguntar, lo que garantiza que la contradicción persista.

---

## 8. Errores típicos que cada arquitectura invita a cometer

### 8.1 Que invita la arquitectura ACTUAL

| Error | Por qué lo invita | Probabilidad |
|---|---|---|
| Calcular dominio en el widget | Ya hay precedente masivo (`relative-row-selection.ts`, `standings-view-model.ts:67`) y ningún lint lo impide | Muy alta |
| Leer una clave inexistente de `scoring[]` | `Record<string, unknown>` + mocks más ricos que la realidad (§5.3) | Muy alta |
| Extender `TelemetrySnapshot` en vez del contrato v1 | Es el tipo que ve el widget; añadir un `campo?: number` "funciona" hasta que hay que llenarlo | Alta |
| Construir sobre `core.Fanout` | 1.533 LOC de código pulido, documentado y muerto (§3.1) | Media-alta |
| Olvidar un punto de registro del widget | 11 de ~20 no rompen compilación (§1.3) | Alta |
| Pegar el nuevo SHA256 del golden sin entenderlo | Sin `-update`, sin diff legible (§6.2) | Alta |
| Añadir señal de un sim al catálogo canónico | Es lo que hizo el corte de delta nativo; el catálogo no tiene concepto de "específico de sim" | Alta |
| Olvidar uno de los 6 docs de `telemetry-core` que registran la señal | Nada lo verifica | Muy alta |
| Olvidar un idioma en i18n | Nada lo verifica | Media |

### 8.2 Que invitaría la SIMPLIFICADA (drivers → engine → FinalState → OverlayFrame → publisher → store → widgets)

| Error | Por qué lo invitaría | Mitigación posible |
|---|---|---|
| Engordar `OverlayFrame` hasta convertirlo en un god-object | Al ser el único contrato, todo campo nuevo va ahí; nada obliga a preguntarse si pertenece a Overlay | Test de tamaño/campos + revisión de contrato por producto |
| Mezclar dominio y presentación en un solo paquete | Sin `projection/<producto>` no hay una frontera obvia entre "estado" y "lo que este producto necesita" | Mantener el paquete de proyección aunque haya un solo frame |
| Perder la modelación de calidad | La tentación de `campo?: number` en el frame único es enorme; hoy `schema.Field` lo impide en Go | Exportar `{value, present, provenance, freshness}` también en el frame |
| Acoplar el engine a LMU | Sin `catalog` ni matriz de autoridad, la regla "cero antes de la primera vuelta significa ausente" (`format.go:366`) migra fácilmente al engine | Conservar `architecture_test.go` con los mismos casos de import |
| Regresión de aislamiento entre productos | Engineer y Strategy comparten hoy 4 proyecciones separadas; un frame único invita a que Overlay sirva a los cuatro | No colapsar los cuatro productos, solo la publicación |

Balance honesto: la simplificada elimina errores de **dispersión** (los más frecuentes) e introduce errores de **acumulación** (menos frecuentes pero peores a 2 años). Para un equipo de agentes, la dispersión es peor: un error de acumulación es visible al abrir un archivo grande; un error de dispersión es invisible por definición.

---

## 9. Principios de diseño LLM-friendly y evaluación

### 9.1 Los ocho principios propuestos (todos comprobables por test)

| # | Principio | Prueba concreta que lo verifica |
|---|---|---|
| P1 | **Una autoridad por concepto**: cada magnitud se calcula en exactamente un lugar | Test que prohíba `sort`, `filter` de dominio y aritmética de dominio bajo `frontend/src/overlay/widget-types/**` |
| P2 | **Un solo camino productivo**: cero código sin consumidor en producción | Test que falle si un símbolo exportado de `internal/telemetry/**` solo aparece en `_test.go` |
| P3 | **Tipos explícitos hasta el renderer**: ningún `Record<string, unknown>` ni acceso por string en la cadena de datos | Regla ESLint + eliminar `scoring[]` a favor de `readonly VehicleFrame[]` tipado |
| P4 | **Contratos generados, no transcritos**: los tipos TS del contrato salen de Go | `go:generate` a TS + test que falle si el archivo generado difiere |
| P5 | **Un nombre por señal en toda la cadena** | Test que exija que id de catálogo, id de derivación, tag JSON y campo TS deriven de una sola declaración |
| P6 | **Tests de arquitectura como documentación ejecutable** | Ya existe (`architecture_test.go`); ampliar a las capas anteriores |
| P7 | **Doc mínima co-localizada y fechada por vigencia** | Un `README.md` por paquete, ≤80 líneas, con la evidencia histórica movida a `docs/history/` |
| P8 | **Goldens actualizables y legibles** | Flag `-update` en todos los tests de golden + JSON indentado |

### 9.2 Cumplimiento por arquitectura

Escala: ●●● cumple, ●●○ parcial, ●○○ apenas, ○○○ no cumple.

| Principio | Actual | Simplificada | Híbrida |
|---|---|---|---|
| P1 una autoridad | ●○○ (delta ×3, standings solo en TS, gaps reinterpretados) | ●●● (un `FinalState`, un frame, un store) | ●●● (se elimina el frontend legacy y la duplicación de delta) |
| P2 un camino | ●○○ (`Fanout` muerto, `analysis` sin consumidor, `TelemetrySnapshot` puente) | ●●● (por construcción) | ●●● (retirar desconectados es parte explícita del alcance) |
| P3 tipos explícitos | ●●○ (Go excelente, TS roto en `scoring[]`) | ●●○ (mismo riesgo si el frame no se tipa por vehículo) | ●●○ (idem; requiere trabajo específico en cualquiera de las tres) |
| P4 contratos generados | ○○○ (0 `go:generate`; mitigado por goldens compartidos) | ●○○ (no viene incluido) | ●○○ (no viene incluido) |
| P5 un nombre por señal | ●○○ (5 nombres para el delta nativo) | ●●○ (menos capas ⇒ menos nombres, pero sin garantía) | ●●○ (igual) |
| P6 tests de arquitectura | ●●● (`architecture_test.go`, 578 LOC, es ejemplar) | ●●○ (hay que reescribirlos para las capas nuevas) | ●●● (se conservan intactos) |
| P7 doc co-localizada | ●○○ (13.400 líneas dispersas + contradicciones) | ●●○ (menos capas que documentar; no arregla lo escrito) | ●●○ (igual) |
| P8 goldens actualizables | ●○○ (sin `-update`, JSON de una línea) | ●○○ (no viene incluido) | ●●○ (menos goldens al desaparecer la duplicación de capas) |

### 9.3 Puntuaciones

**Mantenibilidad por agentes LLM (0-18)** = suma de 6 criterios × 3 puntos: (A) un camino productivo evidente, (B) una autoridad por concepto, (C) tipos y contratos verificados, (D) amplificación acotada, (E) tests generables y actualizables, (F) doc mínima y veraz.

| Criterio | Actual | Simplificada | Híbrida |
|---|---|---|---|
| A — un camino productivo | 1 | 3 | 3 |
| B — una autoridad | 1 | 3 | 3 |
| C — tipos y contratos | 2 | 2 | 2 |
| D — amplificación acotada | 1 | 2 | 2 |
| E — tests | 2 | 2 | 3 |
| F — documentación | 1 | 2 | 2 |
| **Total /18** | **8** | **14** | **15** |

**Facilidad de añadir widgets/señales (0-10)**

| Arquitectura | Señal | Widget | **Global /10** |
|---|---|---|---|
| Actual | 34-45 archivos, 12-18 unidades de mantenimiento | ~20 archivos, 11 sin protección de compilador | **4** |
| Simplificada | ~12-16 archivos, 5-6 unidades | ~20 archivos (el registro del frontend no lo arregla la telemetría) | **8** |
| Híbrida | ~22-28 archivos (conserva catálogo, reducer, derive y proyecciones por producto) | ~20 archivos, pero sin adapter ni snapshot legacy | **7** |

### 9.4 Justificación de las notas

**Actual — 8/18 y 4/10.** No es una arquitectura mal diseñada: `schema.Field`, la separación de drivers, `architecture_test.go` y los goldens compartidos Go↔TS son mejores que la media del sector y **específicamente buenos para agentes**. Pierde en las dimensiones que más pesan en un equipo de LLMs: hay al menos tres caminos plausibles y solo uno bueno (§3), hay autoridad de dominio en dos lenguajes (§2), la amplificación medida es de 45 archivos con 69 % de ceremonia (§4.3), y existe un camino de verificación (mocks de Studio) que **confirma comportamiento falso** (§5.3). Un agente competente puede hacer daño invisible aquí sin violar ninguna regla escrita.

**Simplificada — 14/18 y 8/10.** Resuelve de raíz A, B y D: un `FinalState`, un `OverlayFrame`, un publisher, un store, sin adapter ni snapshot legacy. Elimina de un golpe los 3 archivos de ceremonia pura del §4.3 (`telemetry-snapshot.ts`, `overlay-projection-adapter.ts` + test), el puente donde se pierde la calidad (paso 18 del §1.1), y `core.Fanout`. No sube más porque: (i) no incorpora codegen (P4), así que el contrato TS sigue transcrito a mano; (ii) hay que reescribir `architecture_test.go`, y durante esa reescritura el repo pierde su mejor guardarraíl; (iii) el riesgo de `OverlayFrame` god-object es real a 18-24 meses con cuatro productos y cuatro simuladores.

**Híbrida — 15/18 y 7/10.** Es la mejor nota en mantenibilidad y **no** la mejor en facilidad de ampliación, y esa asimetría es deliberada. Conservar reducer, derive, catálogo y proyecciones por producto significa que añadir una señal sigue costando ~25 archivos (peor que la simplificada), pero conserva intactos los tres activos que más protegen a un agente: `architecture_test.go` sin reescribir (E=3), el modelo de calidad de `schema.Field` en cada frontera, y el aislamiento entre productos que impide que Overlay contamine a Engineer. Simplificar publicación, hubs, status, deltas, frontend legacy y código desconectado ataca **exactamente** los cuatro hallazgos de mayor riesgo del §0 (Fanout muerto, adapter legacy, autoridad duplicada, doc contradictoria) sin abrir un periodo de migración en el que ningún test de arquitectura esté vigente.

Para un equipo compuesto casi solo por agentes, con un orquestador humano que no revisa código línea a línea, **la híbrida es la opción defendible**: cada paso es una retirada verificable de código con consumidor cero o duplicado, revisable por diff, sin ventana en la que el sistema quede sin guardarraíles.

### 9.5 Las cinco acciones de mayor rendimiento (independientes de la arquitectura elegida)

Ordenadas por (riesgo evitado ÷ coste), todas comprobables por test:

1. **Tipar `scoring[]`.** Sustituir `readonly Record<string, unknown>[]` por un array tipado derivado de `OverlayVehicleV1`. Elimina 101 accesos por string, 16 claves fantasma y la divergencia mock/producción. Es el cambio con mejor relación coste/beneficio de todo el informe.
2. **Borrar o marcar `core.Fanout` y `projection/analysis`.** 1.665 LOC de producción sin consumidor. Si deben conservarse, un `// Deprecated:` y un caso en `architecture_test.go` que prohíba importarlos desde `internal/app`.
3. **Flag `-update` en todos los tests de golden + JSON indentado.** Convierte el peor incentivo del repo (pegar un SHA256) en una operación explícita y revisable.
4. **Un `README.md` de ≤80 líneas por paquete de telemetría**, y mover las actas TC-0x a `docs/history/`. Reduce las 13.400 líneas de lectura obligatoria a ~1.500 co-localizadas.
5. **Test de paridad de nombres de señal**: un único test que compruebe que id de catálogo, id de derivación, nombre de layout y tag JSON de cada señal salen de una sola declaración. Ataca el hallazgo del §4.3 (cinco nombres para un escalar) sin refactor.

---

## Anexo A — Comandos de verificación

```powershell
git diff --stat                                    # 51 archivos, +791/-100
git diff --name-only | Select-String -NotMatch updater | Measure-Object   # 45
Select-String -Path internal\telemetry\core\fanout.go -Pattern "NewFanout"
Get-ChildItem -Recurse internal\telemetry -Filter *.golden.json | Measure-Object  # 17
```

```bash
grep -rn "go:generate" --include=*.go internal cmd            # 0 resultados
grep -rn "NewFanout" --include=*.go internal cmd              # solo fanout.go y 2 tests
grep -rho --include=*.ts 'readScoring[A-Za-z]*([^)]*)' frontend/src/overlay/widget-types \
  --exclude=*.test.ts | grep -o ', *"[a-zA-Z]*"' | sort | uniq -c
go list ./internal/telemetry/... | wc -l                      # 27 paquetes
find internal/telemetry -name "*_test.go" | xargs wc -l       # 22.715 LOC
```

## Anexo B — Archivos clave citados

| Ruta | Papel |
|---|---|
| `internal/telemetry/architecture_test.go` | Mejor guardarraíl del repo (imports Go) |
| `internal/telemetry/schema/quality.go:42-75` | `schema.Field[T]`: presencia + provenance + freshness |
| `internal/telemetry/core/fanout.go` | 572 LOC sin consumidor productivo |
| `internal/telemetry/derive/delta.go:114-140` | Autoridad de delta sobreescrita por el valor nativo |
| `internal/telemetry/projection/overlay/v1.go:154-156` | Referencia de delta emitida como literal fijo |
| `internal/app/telemetry_core_runtime.go:185,192,789` | Runtime productivo real (Hub, no Fanout) |
| `frontend/src/overlay/core/telemetry-snapshot.ts:39` | `scoring: readonly Record<string, unknown>[]` |
| `frontend/src/overlay/projection/overlay-projection-adapter.ts:60-70` | 10 campos legacy que la proyección no puede llenar |
| `frontend/src/overlay/core/mock-scenarios.ts:19-21` | Mock más rico que producción |
| `frontend/src/overlay/transports/legacy-retirement.test.ts:22-35` | Buen guardarraíl anti-legacy en TS |
| `frontend/src/overlay/widget-types/relative/relative-row-selection.ts:38-46` | Dominio decidido en el frontend |
| `frontend/eslint.config.js` | 22 líneas: sin reglas de capa |
| `docs/telemetry-core/README.md:12` | Contradice el wiring productivo real |
