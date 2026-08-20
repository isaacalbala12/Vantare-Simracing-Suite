# 12 — Plan de migración incremental (Agente I)

Fecha: 2026-08-19. Base normativa: `11-final-recommendation.md` §12.2 (arquitectura), §12.4 (conservar/modificar/eliminar/posponer) y §12.6 (estructura de fases). Evidencia: `06-reliability-review.md` §13 (20 defectos), `05-performance-and-benchmarks.md` §1/§4/§6/§7 (límite 256 KiB, 35.209 B @104, p99 frontend), `09-cross-review.md` §6 (23 escenarios), `10-decision-matrix.md` §8.2 (condiciones de reevaluación), `07-llm-maintainability.md` (guardarraíles), `04-multisim-model.md` §9 (prueba SimX), `08-alternative-architectures.md` §7.4 (fases 0–2 de la Opción D, incorporadas aquí).

Rama observada: `vantareapp/isa-338-retirar-los-ultimos-confirm-nativos`, HEAD `08e316c1`, **working tree sucio**. Este documento es solo planificación: no modifica producto ni documentación de `docs/telemetry-core/`.

Decisión que se ejecuta: **Arquitectura híbrida (Opción C)**. Conservar el núcleo semántico; reemplazar la frontera operativa (commit, identidad, publicación, aislamiento de consumidores, último kilómetro TypeScript).

---

## 1. Principios del plan

| # | Principio | Consecuencia operativa |
|---|---|---|
| P1 | **No big bang** | Ninguna fase reescribe el núcleo. Cada fase es un conjunto acotado de PRs pequeños, cada uno con su issue de Linear. |
| P2 | **Cada fase es entregable, verde y reversible por separado** | Al final de cada fase: `go build ./...`, `go test ./...`, `go vet`, suite frontend, ESLint y build de Wails en verde. Si no, la fase no ha terminado. |
| P3 | **Compatibilidad hacia atrás mientras conviven caminos** | F0–F5 no cambian el contrato de red. F6–F8 mantienen v1 y v2 en paralelo. Solo F9 retira. |
| P4 | **El legacy se borra únicamente con paridad probada** | Ningún borrado "para simplificar". Cada retirada exige un gate de paridad nombrado en §6 y un test de retirada por nombre (patrón `legacy-retirement.test.ts`). |
| P5 | **Tests antes de mover fronteras** | F0 escribe tests que **fallan** reproduciendo los defectos. Ninguna corrección entra sin su test rojo previo. |
| P6 | **Un consumidor nunca forma parte del commit del Core** | Builders, publicación, Engineer, Strategy y Recording viven fuera de la transacción desde F1/F3. |
| P7 | **No se cambia el canonical y el frontend en el mismo PR** | Los PRs Go y los PRs TS de una misma fase se separan y se ordenan (Go primero, TS detrás del contrato generado). |
| P8 | **Nada se borra por parecer muerto sin un guard que documente el wiring aprobado** | El guard de "símbolo exportado solo referenciado desde tests" entra **antes** que el borrado (F4). |
| P9 | **La observabilidad se añade con el cambio, no después** | Cada fase que altera comportamiento añade su contador/métrica en el mismo PR. Sin métrica no hay criterio de éxito medible. |
| P10 | **Un cambio arquitectónico = un ADR** | ADR nuevo antes de F1 (ver §2.2); ADRs 0004/0005 se enmiendan, no se sustituyen. |
| P11 | **Respeto del flujo de canales** | Rama de issue → `nightly` → testers → `master`. Ninguna fase se integra saltando canal. La promoción a `nightly` y a `master` la autoriza Isaac. |
| P12 | **No mezclar tipos de cambio** | Refactor, feature, fix y docs van en PRs distintos, salvo que el test y el fix sean inseparables. |

---

## 2. Prerrequisitos (P0) — antes de abrir la primera issue de migración

### 2.1 El diff local del native delta LMU

El working tree contiene un cambio **no committeado** que abarca 51 archivos y tres asuntos distintos:

| Bloque | Archivos representativos | Naturaleza |
|---|---|---|
| **DELTA-TELEMETRY** (`mDeltaBest` nativo con presencia/freshness/provenance) | `internal/telemetry/drivers/lmu/{format,layout,fusion,batch_mapper,driver}.go`, `internal/telemetry/derive/{delta,pipeline}.go`, `internal/telemetry/catalog/{ids,catalog}.go`, `internal/telemetry/core/reducer.go`, `internal/telemetry/projection/overlay/v1.go`, goldens `lmu-1.4-delta-overlay-v1.golden.json`, `overlay_v1.golden.json`, `canonical-integration-v1.golden.json` | Feature de dominio, con tests propios |
| **DELTA-REFERENCES** (selector personal/sesión/anterior por instancia del widget) | `frontend/src/overlay/widget-types/delta/*`, `frontend/src/overlay/projection/*`, `frontend/src/overlay/core/telemetry-snapshot.ts`, i18n `studio-v3/{en,es,it,pt}.ts`, `hub/overlay-studio/inspector/*` | Feature de producto |
| **Updater** (sin relación) | `internal/updater/{updater,version}.go` + tests | Cambio ajeno |
| **Docs** | `docs/changelog.md`, `docs/current-plan.md`, `docs/telemetry-core/*.md` (7 archivos) | Documentación de los dos primeros |

**Recomendación: promocionarlo antes de empezar, nunca mezclarlo con la migración.** Justificación: (a) toca exactamente los archivos que F3 y F8 van a mover (`derive/delta.go`, `projection/overlay/v1.go`, `delta-view-model.ts`), de modo que arrastrarlo sin commitear garantiza conflictos irresolubles y pérdida de trabajo; (b) los goldens modificados son la línea base de paridad que F6/F8 van a comparar — si la base no está fijada en git, la paridad no es verificable; (c) `11 §12.8.1` lo cita como evidencia viva de por qué `Field[T]` debe conservarse: su lección debe estar en la historia, no en un stash.

Procedimiento sugerido (lo ejecuta Isaac o un agente con issue propia, **fuera** de este plan):

| Paso | Acción | Issue sugerida |
|---|---|---|
| P0.1 | Separar el bloque **updater** en su propia rama/PR; no tiene relación con telemetría | *"Aislar el cambio local de updater/version en su propia issue"* (S) |
| P0.2 | Committear **DELTA-TELEMETRY** (Go + goldens + docs de `telemetry-core` correspondientes) en rama de issue, con su gate: `go test ./internal/telemetry/...` y paridad de replay verde | *"LMU: `mDeltaBest` nativo como señal observada con presencia y provenance"* (M) |
| P0.3 | Committear **DELTA-REFERENCES** (frontend + i18n + inspector) detrás de P0.2 | *"Widget Delta: referencia seleccionable por instancia (personal/sesión/anterior)"* (M) |
| P0.4 | Promocionar ambas a `nightly` y dejar la línea base en verde | — |
| P0.5 | **Alternativa explícita**: si Isaac decide no promocionarlo, descartarlo (`git stash` etiquetado o rama de archivo) y regenerar los goldens desde HEAD limpio, **antes** de F0 | *"Archivar el diff local de delta nativo y restaurar goldens de HEAD"* (S) |

**Condición de arranque de F0:** `git status --short` limpio sobre `internal/telemetry/**`, `internal/app/telemetry*`, `frontend/src/overlay/**`. Sin esto, la red de seguridad de F0 mide un árbol que nadie podrá reproducir.

### 2.2 ADR nuevo

| Campo | Contenido |
|---|---|
| Nombre sugerido | `docs/adr/0008-telemetry-engine-commit-boundary-and-overlay-frame-v2.md` |
| Título | *Frontera única de commit (`TelemetryEngine.Apply`), aislamiento de consumidores y `OverlayFrame v2` compacto* |
| Estado | Proposed → Accepted antes de fusionar el primer PR de F1 |
| Qué decide | (1) Existe **una sola** frontera transaccional: estado + cursor del mapper + facts se hacen visibles a la vez; (2) la publicación y los consumidores (Overlay, Engineer, Strategy, Recording) quedan **fuera** del commit y su fallo **nunca** es terminal; (3) el status viaja **dentro** del frame y `statusRevision` como cursor contiguo se retira; (4) el contrato de salida a producto es `OverlayFrame v2` compacto, full, latest-wins, con capabilities declaradas; (5) el contrato TS de los tipos wire se **genera** desde Go y se prohíbe editarlo a mano; (6) el canonical **no** se genera todavía (queda pospuesto con condiciones falsables, ver §7) |
| Qué no decide | No cambia `schema.Field[T]`, ni los dominios tipados, ni el aislamiento de productos, ni el versionado independiente canonical/projection/recording |
| Relación con ADRs existentes | **Enmienda parcialmente** `0004-telemetry-core-modular-observation-architecture.md` (mantiene la modularidad de observación; sustituye la política de commit por componente y la política de fallo fail-stop) y **no modifica** `0005-historical-storage-sqlite-mcap.md` ni `0005-duckdb-helper-for-historical-telemetry.md` (DuckDB sigue siendo post-sesión, ver F12). También toca la superficie de `0005-engineer-projection-capability-contract.md`: Engineer conserva su contrato de capabilities y su `boundary.go`, cambia solo su modo de entrega (asíncrono latest-wins) |
| Consecuencias registradas | `core.Fanout`, RFC 7396, seal SHA-256, `statusRevision` y la proyección Analysis live salen del sistema; `TelemetrySnapshot` queda en retirada programada |

### 2.3 Documentación que hoy contradice el wiring (no se toca en esta investigación)

| Archivo | Contradicción observada | Acción y fase |
|---|---|---|
| `docs/telemetry-core/README.md:12` | Afirma *"todavía no existe wiring productivo global"* cuando el runtime lleva conectado desde TC-07C. Un agente que lea esto construirá sobre supuestos falsos | Corregir en **F4** (mismo PR que el guard de wiring), issue de docs separada |
| `docs/telemetry-core/runtime-fanout.md` | Describe `core.Fanout` como el distribuidor del runtime canónico; `grep NewFanout` devuelve **solo** `fanout.go` y `fanout_test.go` **[VERIFICADO]** | Sustituir por una nota de retirada en **F4**, tras portar `FactResyncRequiredError` |
| `docs/telemetry-core/runtime-projections.md` (y las 7 páginas tocadas por el diff local) | Describen contratos v1 que F6–F9 sustituyen | Actualizar por fase, nunca por adelantado; la página v1 se marca *"vigente hasta F9"* |

Regla: **cada fase que cambia comportamiento incluye el PR de docs correspondiente en la misma issue-madre pero en commit separado** (P12).

---

## 3. Fases

Convención de tamaño: **S** = 1 PR; **M** = 2–4 PRs; **L** = 5–8 PRs. Riesgo: **Bajo / Medio / Alto**.
Cada fase se abre como una issue-madre en Linear con sub-issues por PR.

---

### F0 — Red de seguridad (baseline ejecutable)

| Campo | Contenido |
|---|---|
| **Objetivo** | Convertir los defectos de 06 §13 y los escenarios inseguros de 09 §6 en tests **rojos** y en benchmarks versionados, sin cambiar una línea de arquitectura. |
| **Depende de** | P0 (árbol limpio). |
| **Tamaño / riesgo** | **M** / **Bajo** (solo archivos `_test.go`, `*.test.ts` y `bench/`). |

**Alcance exacto**

*Crear:*
- `internal/app/telemetry_core_runtime_grid_test.go`
- `internal/app/telemetrytransport/payload_ceiling_test.go`
- `internal/telemetry/core/commit_boundary_test.go`
- `internal/telemetry/drivers/lmu/identity_grace_test.go`
- `internal/app/telemetry_core_runtime_consumer_test.go`
- `internal/app/telemetry_core_runtime_watchdog_test.go`
- `frontend/src/telemetry-transport/store.freshness.test.ts`
- `bench/results/baseline-2026-08/*` (congelar payload/parse/proyección como línea base comparable)

*Modificar:* `internal/telemetry/architecture_test.go` (solo añadir casos, nunca relajar), `internal/telemetry/drivers/lmu/batch_mapper_test.go` (documentar que `batch_mapper_test.go:326` fija el comportamiento **actual**, no el deseado).

*Borrar:* nada.

**Tests que se añaden (todos deben fallar o documentar el fallo)**

| Test sugerido | Aserción | Defecto que reproduce |
|---|---|---|
| `TestRuntimePublishes104VehiclesEndToEnd` | Con 104 vehículos, el runtime publica Overlay y Engineer y sigue vivo | D-08 (falla hoy: `ErrPayloadTooLarge` → terminal) |
| `TestOverlayPayloadStaysUnderTransportLimit` | `NewOverlayFull` ≤ `MaxPayloadBytes` para 1/20/62/104 | D-08 (falla desde 103) |
| `TestPostReducerStageFailureKeepsCursorsAligned` | Inyectar error en `coord.Apply` y en `derive.Apply`; el frame siguiente **no** produce `ErrStaleBatch` | D-01 |
| `TestPublishFailureIsNotTerminal` | Error de publicación → contador +1, `lifecycle` sigue `running` | D-02 |
| `TestVehicleHistoryDoesNotOverflowInLongSession` | 300 identidades distintas a lo largo de la sesión, sin `ErrVehicleHistoryOverflow` | D-04 |
| `TestSlotMissingOneFrameKeepsVehicleIdentity` | Fila ausente 1 frame → misma `VehicleID`; si es el player, `ControlsHistory` y referencia de delta sobreviven | D-03 |
| `TestSlotReusedByAnotherCarGetsNewIdentity` | Slot reabierto con `(mID, driverName, class)` distinto → identidad nueva | Escenario 17 |
| `TestSessionSignatureStaleDoesNotMergeSessions` | Transición P→Q→R con firma `Stale` no funde la sesión nueva con la anterior | 06 §13 #11, escenario 15 |
| `TestSlowEngineerDoesNotBlockDriverLoop` | Engineer con 50 ms de latencia; el intervalo entre lecturas del driver no se degrada | Engineer síncrono, escenario 21 |
| `TestConsumerPanicDoesNotKillProcess` | Panic en un consumidor → recuperado y contado | 06 §13 #13 |
| `TestFrozenPipelineStopsReportingFresh` | Sin frames durante 1 s, la frescura publicada deja de ser `fresh` | D-06 |
| `TestStatusErrorReachesSubscribersBeforeHubsClose` | El status `error` se publica antes de cerrar hubs | D-06 (segunda mitad) |
| `store.freshness.test.ts` → *"degrada a stale cuando `capturedAt` supera el umbral"* | Watchdog local en el store con reloj del cliente | D-06 lado TS |
| `store.test.ts` → *"acepta una revisión de status mayor no contigua"* | No lanza ni descarta el snapshot | D-07 |
| `BenchmarkOverlayProjectionAndMarshal{1,20,104}` + `payload_bytes` | Línea base versionada con `benchstat` | §5 criterios |

**Comportamiento compatible:** total. Ningún cambio de producción.

**Observabilidad:** ninguna todavía (F1 la introduce); F0 solo deja el `bench/results/baseline-2026-08/` como referencia comparable.

**Rollback:** revert de PRs de test aislados; sin impacto en runtime.

**Criterios de éxito:** los tests de D-01, D-02, D-03, D-04, D-06, D-07, D-08 y de los escenarios 15/17/21 existen y **fallan** por la causa esperada (no por error de fixture). Los que documentan comportamiento actual correcto (fusión, TTL, absorción de frames no mapeables, latest-wins) están en verde y marcados como *característica a migrar literalmente*.

**Legacy que se borra:** ninguno.

---

### F1 — Fallo no terminal y publicación fuera del commit

| Campo | Contenido |
|---|---|
| **Objetivo** | Que ningún fallo de producto, payload o consumidor detenga la adquisición. Cerrar la clase de defecto que convierte una anomalía transitoria en *"reinicia la aplicación"*. |
| **Depende de** | F0. |
| **Tamaño / riesgo** | **M** / **Medio** (toca `telemetry_core_runtime.go`, el archivo más central). |

**Alcance exacto**

*Modificar:*
- `internal/app/telemetry_core_runtime.go` — clasificación de errores en lugar de `failStop` uniforme (`:846-865`, `:296-299`, `:662-670`); publicación movida **después** del commit; `recover()` por frontera de consumidor; status `error` publicado **antes** de cerrar hubs.
- `internal/app/telemetrytransport/transport.go` — `ErrPayloadTooLarge` deja de propagarse como fatal; se cuenta y se descarta el frame. `MaxPayloadBytes` (`:44`) se conserva como **prueba de contrato**, no se sube en silencio.
- `internal/telemetry/core/driver_manager.go` — `setTerminal` (`:296-298`) reservado a errores de programación.

*Crear:*
- `internal/app/telemetry_core_metrics.go` (o ampliar `TelemetryCoreMetrics`, `runtime:70-83`) con los contadores nuevos.
- `internal/app/telemetry_core_runtime_failure_policy.go` — tabla explícita `error → clase` (driver/invariante · producto/payload · consumidor).

*Borrar:* nada todavía.

**Comportamiento compatible:** contrato de red idéntico. Feature flag interno `telemetryFailurePolicyV2` (por defecto **on** en rama de issue, conmutable en configuración de diagnóstico) que permite volver a la política anterior durante un ciclo de nightly.

**Tests ANTES:** los de F0 (`TestPublishFailureIsNotTerminal`, `TestConsumerPanicDoesNotKillProcess`, `TestStatusErrorReachesSubscribersBeforeHubsClose`, `TestRuntimePublishes104VehiclesEndToEnd` en su parte de "no muere").
**Tests DESPUÉS:** `TestFailureClassificationTable` (cada error tipado del Core mapea a exactamente una clase, tabla exhaustiva); `TestDroppedFrameIncrementsCounterAndPublishesDegraded`; `TestRuntimeRestartsAfterTransientFailure` (un `Start` posterior no devuelve `ErrClosed`).

**Observabilidad añadida:** `telemetry_frames_dropped_total{reason}`, `telemetry_publish_failures_total{product}`, `telemetry_consumer_panics_total{boundary}`, `telemetry_fail_stop_total`, `telemetry_payload_bytes{product}` (p50/p95/p99), `telemetry_lifecycle_transitions_total{from,to}`.

**Rollback:** flag `telemetryFailurePolicyV2=false`; en último extremo `git revert` de la fase completa.

**Criterios de éxito:** cierra **D-02** y la mitad "no terminal" de **D-08**; `TestRuntimePublishes104VehiclesEndToEnd` pasa a *degrada y sigue* (el payload todavía se rechaza, pero ya no mata); `telemetry_fail_stop_total` = 0 en una sesión de carrera real de 60 min; escenario 23 de 09 §6 baja de riesgo **A** a **B**.

**Legacy que se borra:** ninguno. Prueba de paridad: los goldens de proyección v1 no cambian.

---

### F2 — Watchdog y stale honesto

| Campo | Contenido |
|---|---|
| **Objetivo** | Que un pipeline congelado deje de presentarse como `fresh` en menos de 1 s, en backend y en frontend. |
| **Depende de** | F1. |
| **Tamaño / riesgo** | **S–M** / **Bajo**. |

**Alcance exacto**

*Modificar:*
- `internal/app/telemetry_core_runtime.go` — watchdog monotónico *"sin frames desde hace X"* que degrada el status publicado.
- `internal/app/telemetrytransport/transport.go:333` — dejar de exigir contigüidad de `statusRevision` (el campo se conserva, se degrada a informativo; se elimina en F6 al integrarse en el frame v2).
- `frontend/src/telemetry-transport/store.ts:91-108`, `:112-114` — aceptar cualquier revisión **mayor**; no descartar el snapshot por desajuste de revisión; watchdog de edad local (`capturedAt` vs `Date.now()`).
- `frontend/src/overlay/core/telemetry-adapter.ts` — propagar la degradación a los ViewModels sin inventar valores.

*Crear:* `frontend/src/telemetry-transport/freshness-watchdog.ts` (+ test).

**Comportamiento compatible:** el stream de status v1 se mantiene para clientes existentes, generado desde el mismo estado. Widgets sin cambios.

**Tests ANTES:** `TestFrozenPipelineStopsReportingFresh`, `store.freshness.test.ts`, `store.test.ts` (revisión no contigua).
**Tests DESPUÉS:** `TestWatchdogDegradesWithinOneSecond` (parámetro configurable, aserción sobre reloj inyectado); `store.watchdog.test.ts` → *"un frame de hace 3 s se pinta como stale aunque el backend calle"*; `TestReconnectRecoversWithoutRestart` (escenarios 1, 2, 13, 20 de 09 §6).

**Observabilidad:** `telemetry_last_frame_age_ms` (gauge, backend), `telemetry_watchdog_degradations_total`, y en el frontend un diagnóstico `snapshot-stale-watchdog` análogo al `snapshot-resync` existente (`store.ts:176-183`).

**Rollback:** flag `telemetryWatchdogEnabled`; el store tolera su ausencia.

**Criterios de éxito:** cierra **D-06** y **D-07**; escenario 20 de 09 §6 pierde su ventana residual; ningún widget muestra dato de hace más de 1 s marcado como fresco; sin regresión visual Playwright en los widgets de estado.

**Legacy que se borra:** la exigencia de contigüidad de `statusRevision` en TS. Prueba de paridad: `store.test.ts` cubre revisión contigua, no contigua y retrocedida.

---

### F3 — Transacción única: `TelemetryEngine.Apply`

| Campo | Contenido |
|---|---|
| **Objetivo** | Un solo commit: estado + cursor del mapper + facts se hacen visibles a la vez. Identidad de dominio separada de la continuidad del stream, con ventana de gracia. |
| **Depende de** | F0 (tests). Puede ir en paralelo con F2 (archivos distintos) pero **no** con F1 (comparten `telemetry_core_runtime.go`). |
| **Tamaño / riesgo** | **L** / **Alto** (es el corazón del cambio). |

**Alcance exacto**

*Crear:*
- `internal/telemetry/engine/engine.go` — `TelemetryEngine.Apply`: `prepare → validate → reduce → derive → facts → COMMIT ATÓMICO`.
- `internal/telemetry/engine/commit.go` — resultado inmutable `(CanonicalState, []Fact, Cursor)`.
- `internal/telemetry/identity/slot.go` — helper compartido de generaciones de slot con **ventana de gracia** (por defecto 30 frames, configurable) y verificación `(sourceKey, driverName, class)` al reabrir.
- `internal/telemetry/identity/eviction.go` — retención acotada + evicción LRU de identidades no vistas.
- `internal/telemetry/schema/identity/stint.go` — `StintID` (tramo entre paradas/cambios de piloto).

*Modificar:*
- `internal/telemetry/drivers/lmu/batch_mapper.go` (`:146-149`, `:168-183`, `:186-212`, `:294-295`, `:299-333`) — prepare/commit; el cursor no avanza hasta el commit del Engine; *"cambio de player"* deja de implicar epoch nuevo; se rellena `RunIdentity.Driver`/`.Team` desde `DriverName` (cierra **D-05**). `IsUnmappableFrame` se migra **literalmente**.
- `internal/telemetry/core/reducer.go` (`:137`, `:228-230`) — deja de commitear por su cuenta; conserva sus 9 errores tipados y los clones defensivos.
- `internal/telemetry/core/session_coordinator.go` (`:27-29`, `:296-304`, `:309`, `:311-317`, `:322-325`, `:346-358`) — su responsabilidad entra en `Apply`; **se conservan** high-water de vueltas y presencia continua; desaparece el cursor y el commit propios; el tope de 104 identidades pasa a política de evicción.
- `internal/telemetry/derive/pipeline.go` (`:269-271`, `:312-347`) y `derive/delta.go` (`:95-105`, `:146-149`) — se ejecutan dentro del `Apply` sobre candidatos; `AlgorithmVersion` se conserva para la paridad de replay; `cloneSelfDeltaTracker` pasa a copy-on-write (06 §13 #14).
- `internal/app/telemetry_core_runtime.go` — llama a `Apply` en lugar de orquestar cinco componentes.
- `internal/telemetry/architecture_test.go` — nuevos casos de import para `engine/` e `identity/`.

*Borrar (dentro de la fase, con test previo):* `core.Reducer.Run` (`reducer.go:183-186`, sin llamador, fail-stop al primer rechazo); el registro DAG de `derive` que no ejecuta nada (el orden real está escrito a mano en `Apply`).

**Comportamiento compatible:** contrato de red idéntico. El cambio de identidad **sí** altera comportamiento observable en el caso de frame perdido — por eso F0 fija el comportamiento actual y F3 lo sustituye con test explícito y nota en el changelog. Flag `telemetryEngineApply` para conmutar entre la orquestación anterior y la nueva durante un ciclo de nightly.

**Tests ANTES:** `TestPostReducerStageFailureKeepsCursorsAligned`, `TestSlotMissingOneFrameKeepsVehicleIdentity`, `TestSlotReusedByAnotherCarGetsNewIdentity`, `TestVehicleHistoryDoesNotOverflowInLongSession`, `TestSessionSignatureStaleDoesNotMergeSessions`.
**Tests DESPUÉS:**
- `TestApplyIsAllOrNothing` — error inyectado en cada uno de los 5 pasos × cada tipo de error tipado: el estado, el cursor y los facts quedan **exactamente** como antes.
- `TestApplyRetryDoesNotDivergeCursors` — reintento del mismo `SourceFrame` produce el mismo commit.
- `TestGraceWindowExpiryReleasesSlot` — pasada la ventana, el slot se declara vacante.
- `TestPlayerReappearanceKeepsControlsHistoryAndDeltaReference` — el widget insignia sobrevive a un microcorte de 16 ms.
- `TestDriverChangeEmitsFactAndOpensNewStint` — cierra **D-05** (`FactDriverChanged` deja de ser inalcanzable) y abre `StintID`.
- `TestIdentityEvictionKeepsBoundedMemory` — 500 identidades, memoria acotada, sin error.
- **Paridad de replay:** `canonical_integration_test.go` sigue verde con digest SHA-256 idéntico en los dos modos de pacing, salvo migración explícita de IDs documentada en el golden.

**Observabilidad:** `telemetry_engine_sequence` (gauge), `telemetry_frames_rejected_total{stage,reason}`, `telemetry_slot_grace_reopen_total`, `telemetry_slot_generation_bumps_total`, `telemetry_identity_evicted_total`, `telemetry_apply_duration_us{p50,p99}`.

**Rollback:** flag `telemetryEngineApply=false` durante un ciclo; después, `git revert` de la fase (que es grande — de ahí que se divida en 5–8 PRs con la fachada introducida primero y los componentes migrados uno a uno).

**Criterios de éxito:** cierra **D-01**, **D-03**, **D-04**, **D-05**; escenarios 7, 16 y 19 de 09 §6 dejan de fallar de forma insegura; paridad de replay por digest verde en dos pacings; `telemetry_frames_rejected_total` con causa clasificada y `ErrStaleBatch` desaparecido del log en 60 min de carrera; `Apply` p99 < 1 ms con 104 coches (línea base F0: reducer 28,5 µs + coordinator 30,9 µs + derive 144 µs).

**Legacy que se borra:** `Reducer.Run`, registro DAG de `derive`, cursores independientes del coordinator y del mapper. Prueba de paridad: goldens de proyección v1 sin cambios + digest de replay idéntico.

---

### F4 — Borrado de lo desconectado y guard de wiring

| Campo | Contenido |
|---|---|
| **Objetivo** | Que ningún agente pueda confundir código muerto con el camino vivo, y que el repositorio tenga un guard ejecutable que lo impida en el futuro. |
| **Depende de** | F1 (para portar lo que se rescata). Paralelizable con F3 si se ordena: primero el guard, luego los borrados. |
| **Tamaño / riesgo** | **M** / **Bajo** (nada de lo borrado se ejecuta) — salvo el rescate previo, que es **Medio**. |

**Alcance exacto**

*Rescatar antes de borrar:*
- `FactResyncRequiredError` y la retención acotada de facts de `internal/telemetry/core/fanout.go` → mover al puerto de Engineer (`internal/telemetry/projection/engineer/`), consumidos por F7.
- El patrón de canal cap-1 con drop de `fanout.go:210-217` → documentar como referencia del puerto de Engineer.

*Borrar:*
- `internal/telemetry/core/fanout.go` + `fanout_test.go` (**1.533 líneas**, `NewFanout` solo referenciado desde tests **[VERIFICADO]**).
- `internal/app/telemetrytransport/merge_patch.go` (+ test) y `frontend/src/telemetry-transport/merge-patch.ts` (+ test) — RFC 7396 nunca ejercido; **−0,55 %** medido sobre v1 y **−0,15 %** sobre el compacto.
- Seal SHA-256 en `internal/app/telemetrytransport/transport.go:85`, `:99`, `:113`, `:752-785` — campo no exportado, sin tag JSON, nunca cruza un proceso.
- `internal/telemetry/projection/analysis/v1.go` (`NewAnalysisFull`) fuera del transporte; el paquete de contrato puede conservarse marcado `// Deprecated:` si sirve de referencia para F12.
- `frontend/src/overlay/core/telemetry-store.ts` si el guard confirma cero importadores productivos.
- El escáner de claves fantasma asociado a `scoring: Record<string, unknown>` **no** se borra aquí (depende de F9).

*Crear:*
- `internal/telemetry/wiring_guard_test.go` — **el guard**: `TestExportedSymbolsHaveProductionCaller`, que falla listando `archivo:línea` cuando un símbolo exportado de `internal/telemetry/**` solo aparece referenciado desde `_test.go`. Allow-list explícita y comentada para las excepciones legítimas (replay, diagnostics).
- Ampliación de `frontend/src/overlay/transports/legacy-retirement.test.ts` con los strings nuevos prohibidos (`mergePatch`, `applyMergePatch`, `telemetry-store`).

*Modificar (docs, PR separado):* `docs/telemetry-core/README.md:12`, `docs/telemetry-core/runtime-fanout.md` (§2.3).

**Comportamiento compatible:** total; nada de lo borrado se ejecutaba.

**Tests ANTES:** el guard entra **antes** que los borrados y debe fallar listando exactamente los símbolos que F4 va a retirar (P8).
**Tests DESPUÉS:** guard en verde; `go build ./...` y suite completa verdes; `TestFactResyncRequiredErrorPortedToEngineerPort` (el contrato rescatado tiene dueño nuevo).

**Observabilidad:** ninguna nueva; se retiran los 4 hashes por frame del seal (medible en `BenchmarkOverlayProjectionAndMarshal`).

**Rollback:** `git revert` del PR de borrado; el guard se conserva.

**Criterios de éxito:** cierra 06 §13 #15, #16, #17 (mitad "borrar") y #18; `grep -r "fanout" docs/` no devuelve una página que describa el camino vivo; el guard falla si alguien reintroduce un símbolo huérfano; benchmark de marshal mejora de forma medible al retirar el seal.

**Legacy que se borra:** `core.Fanout`, RFC 7396 (Go y TS), seal, `NewAnalysisFull` del transporte, `telemetry-store.ts` muerto. Prueba de paridad: build + suite completa + goldens de proyección sin cambios (ninguno de estos símbolos participaba en un golden).

---

### F5 — Contrato TS generado

| Campo | Contenido |
|---|---|
| **Objetivo** | Eliminar el espejo manual de tipos wire entre Go y TypeScript; que el compilador y CI impidan que diverjan. |
| **Depende de** | F4 (superficie ya limpia). Paralelizable con F3. |
| **Tamaño / riesgo** | **M** / **Bajo** (no cambia ningún contrato de red). |

**Alcance exacto**

*Crear:*
- `tools/telemetry-contract-gen/main.go` — generador Go → TS de los **tipos wire** (structs con tags JSON de `projection/**` y `envelope`), enums y constantes. **No** genera el canonical.
- `frontend/src/generated/telemetry.ts` con cabecera `// DO NOT EDIT — generated by tools/telemetry-contract-gen`.
- `frontend/src/generated/telemetry.generated.test.ts` — el generado compila y satisface los goldens compartidos Go↔TS.
- Tarea en `Taskfile.yml`: `task telemetry:contract` (regenera) y `task telemetry:contract:check` (regenera y exige `git diff --exit-code`).
- Gate en CI que ejecuta `telemetry:contract:check`.

*Modificar:* `frontend/src/telemetry-transport/contracts.ts` para reexportar del generado en lugar de declarar a mano.

**Comportamiento compatible:** total; los tipos generados deben ser **estructuralmente idénticos** a los actuales en el primer PR (ese es su test).

**Tests ANTES:** `TestGeneratedContractMatchesHandwritten` — el generador produce, sobre los tipos v1 **actuales**, exactamente lo que hoy está escrito a mano (28 campos). Si no coincide, el espejo manual ya había divergido y eso es un hallazgo.
**Tests DESPUÉS:** gate de CI *"regenerar deja el árbol limpio"*; `legacy-retirement.test.ts` prohíbe editar `frontend/src/generated/**` a mano (regla por ruta, no por string).

**Observabilidad:** ninguna en runtime; métrica de proceso: número de campos generados vs escritos a mano (debe llegar a 0 escritos a mano).

**Rollback:** revert; el archivo generado puede congelarse como fuente manual temporalmente.

**Criterios de éxito:** desaparece el espejo manual; el gate falla ante una edición manual del generado; ningún cambio en los goldens de proyección; incorpora las fases 1–2 de la Opción D (08 §7.4) sin su fase 8.

**Legacy que se borra:** las declaraciones manuales duplicadas en `contracts.ts`. Prueba de paridad: `projection-golden.test.ts` verde antes y después.

---

### F6 — Vertical slice: primer builder Go + `OverlayFrame v2` en shadow

| Campo | Contenido |
|---|---|
| **Objetivo** | Demostrar el camino nuevo de extremo a extremo con **un** feature, medido en WebView2 y en OBS, sin retirar nada. |
| **Depende de** | F3 (estado canónico estable) **y** F5 (contrato generado). |
| **Tamaño / riesgo** | **L** / **Medio**. |

**Alcance exacto**

*Crear:*
- `internal/telemetry/projection/overlayv2/frame.go` — `OverlayFrame v2` compacto (array de vehículos, status embebido, capabilities declaradas, `sources[]`).
- `internal/telemetry/projection/overlayv2/builder_player.go` — `PlayerInstrumentsView` / `ControlsVM`: speed, RPM, gear, pedales + status + capabilities.
- `internal/telemetry/projection/overlayv2/testdata/overlay_v2.golden.json` (1 / 20 / 104 vehículos).
- `internal/app/telemetrytransport/publisher.go` — **un** Publisher parametrizado (latest-wins, retiene último full, `ReplayStatus()` + `ReplaySnapshot()`, descarta y cuenta si excede límite), instanciado solo para productos con consumidor arrancado.
- `frontend/src/telemetry-transport/overlay-frame-v2-store.ts` — store inmutable con referencia estable por frame; **no** adapta a `TelemetrySnapshot`.
- `frontend/src/overlay/telemetry-shadow/overlay-frame-v2-parity.test.ts`.

*Modificar:* `internal/app/telemetry_core_runtime.go` (publica v1 **y** v2 en paralelo); `frontend/src/overlay/widget-types/pedals-telemetry/*` o el widget de instrumentos elegido, tras la bandera de shadow; `frontend/src/overlay/telemetry-shadow/overlay-shadow-comparator.ts` para comparar v1 vs v2 en vivo.

*Borrar:* nada.

**Comportamiento compatible:** v1 sigue siendo la ruta productiva. v2 corre en shadow tras el flag `overlayFrameV2Shadow`. El usuario no ve diferencia.

**Tests ANTES:** `TestOverlayV2GoldenMatchesV1SemanticsForPlayer` — para cada campo del slice, el valor mostrado por v1 y por v2 coincide (comparación de **valor mostrado**, no de forma).
**Tests DESPUÉS:**
- `TestOverlayFrameV2StaysUnder64KiBWith104Vehicles` — objetivo medido: 35.209 B; gate 64 KiB.
- `TestOverlayFrameV2ParsesUnderOneMillisecondP99` — 104 coches, medido en el runner del frontend y **anotado** con la medición manual en WebView2 y en OBS (que no es automatizable en CI).
- `overlay-frame-v2-parity.test.ts` — paridad byte a byte del valor mostrado sobre los goldens de 1/20/104.
- `TestPublisherIsInstantiatedOnlyForActiveConsumers` — sin consumidor, no hay hub.
- Playwright: sin regresión visual en el widget migrado con la ruta v1 **y** con la v2.

**Observabilidad:** `overlay_v2_payload_bytes{vehicles}`, `overlay_v2_build_duration_us{p50,p99}`, `overlay_shadow_mismatches_total{field}` (el contador que autoriza la conmutación), `publisher_dropped_frames_total{product}`.

**Rollback:** flag `overlayFrameV2Shadow=false`; el widget vuelve a v1 sin desplegar nada.

**Criterios de éxito:** `overlay_shadow_mismatches_total` = 0 durante **N sesiones reales** (recomendado: 5 sesiones de ≥20 min, al menos una con >40 coches); payload 104 coches < 64 KiB **[objetivo medido 35 KB]**; parse+decode p99 < 1 ms en WebView2; medición confirmada también en OBS browser source.

**Legacy que se borra:** ninguno todavía. Este es el gate que autoriza F8.

---

### F7 — Aislamiento de consumidores (Engineer, Strategy, Recording)

| Campo | Contenido |
|---|---|
| **Objetivo** | Que un consumidor lento, caído o en pánico no toque el bucle de adquisición; y que los facts tengan una política distinta a la de los snapshots. |
| **Depende de** | F1 y F3. Paralelizable con F6 (archivos distintos), coordinando el toque a `telemetry_core_runtime.go`. |
| **Tamaño / riesgo** | **M–L** / **Medio**. |

**Alcance exacto**

*Crear:*
- `internal/app/engineer_port.go` — entrega asíncrona latest-state (canal cap 1, drop-oldest) + facts ordenados con cursor propio y `FactResyncRequiredError` (rescatado en F4), con **timeout** y `recover()`.
- `internal/telemetry/projection/engineer/fact_cursor.go` — cursor de facts y resync explícito.

*Modificar:*
- `internal/app/telemetry_core_runtime.go:673` — deja de llamar a `engineer_service.ConsumeObservation` en línea (`engineer_service.go:660-665` toma `s.mu`, compartido con el puente de Wails).
- `internal/app/strategy_live_runtime.go` + `internal/telemetry/projection/strategy/v1.go` — se conserva el builder y su contrato; **deja de publicarse por transporte público** hasta que exista un Planner consumidor; su fallo se desacopla del Overlay.
- `internal/telemetry/recording/coordinator.go` — se añaden **gap markers** y política de degradación explícita (`Incomplete` deja de ser implícito). **Sigue sin conectarse** (eso es F12).
- `internal/app/telemetry_core_runtime.go` (`:701-705`) — el fallo de proyección de un fact intermedio pasa a ser boundary, no *"saltar y seguir"* (06 §13 #10).

**Comportamiento compatible:** Engineer sigue recibiendo el mismo contrato; solo cambia el modo de entrega (puede perder frames intermedios por coalescing, nunca facts). Strategy deja de estar en el transporte público — **cambio observable** para cualquier cliente que lo consumiera; el guard de F4 y `grep` confirman que no hay ninguno.

**Tests ANTES:** `TestSlowEngineerDoesNotBlockDriverLoop`, `TestConsumerPanicDoesNotKillProcess`.
**Tests DESPUÉS:**
- `TestEngineerLatestWinsDropsIntermediateStates` — con cap 1, el consumidor lento recibe el último, no una cola.
- `TestEngineerFactsAreOrderedAndNeverDropped` — los facts no se coalescen; un hueco produce `FactResyncRequiredError`, no silencio.
- `TestEngineerTimeoutIsBoundedAndCounted` — timeout configurable, contador, sin bloqueo.
- `TestFactProjectionFailureIsBoundaryNotSkip`.
- `TestRecordingWritesGapMarkerOnBackpressure` — nunca finge continuidad.
- `TestStrategyFailureDoesNotAffectOverlay`.

**Observabilidad:** `engineer_consume_latency_ms{p50,p99}`, `engineer_states_dropped_total`, `engineer_fact_resync_total`, `engineer_timeouts_total`, `recording_gap_markers_total`, `consumer_recover_total{boundary}`.

**Rollback:** flag `engineerAsyncPort`; Strategy se puede reexponer con un flag durante un ciclo.

**Criterios de éxito:** escenario 21 de 09 §6 deja de bloquear el bucle del driver **medido** (intervalo entre lecturas del driver estable con Engineer a 50 ms); `engineer_consume_latency_ms` publicado; cierra el defecto *"Engineer síncrono"* y 06 §13 #10 y #13.

**Legacy que se borra:** la llamada síncrona en `telemetry_core_runtime.go:673` y la publicación pública de Strategy. Prueba de paridad: los goldens de Engineer v1 y de Strategy v1 no cambian; solo cambia quién los entrega y cuándo.

---

### F8 — Migración por feature (un builder y un widget cada vez)

| Campo | Contenido |
|---|---|
| **Objetivo** | Llevar cada feature de Overlay al camino v2, con shadow y paridad **individual**, sin retirar nada hasta que todas pasen. |
| **Depende de** | F6. |
| **Tamaño / riesgo** | **L** (una issue y 1–2 PRs por builder) / **Medio**. |

**Alcance exacto** — por cada builder, un ciclo idéntico:

| Builder Go (nuevo) | Widget(s) TS afectados | Dominio que sube de TS a Go |
|---|---|---|
| `builder_standings.go` → `StandingsVM` | `widget-types/standings`, `multiclass-relative`, `broadcast-tower` | Orden (hoy `standings-view-model.ts:96` cae a `index+1` sin avisar) |
| `builder_relative.go` → `RelativeVM` | `widget-types/relative`, `head-to-head` | Selección y orden de filas, gaps estimados con `Authority` |
| `builder_delta.go` → `DeltaVM` | `widget-types/delta`, `delta-advanced`, `delta-trace` | Resolución de referencia (`personal-best → session-best → unavailable`) declarada en el frame |
| `builder_fuel.go` → `FuelVM` | `widget-types/fuel-strategy` | `fuelHistory` y stint (hoy solo existe en TypeScript) |
| `builder_session.go` → `SessionVM` | `widget-types/racing-flags`, `race-schedule`, `track-weather` | Fases, banderas, remaining |
| `builder_controls.go` → `ControlsVM` (ampliación de F6) | `widget-types/input-telemetry`, `pedals`, `pedals-telemetry*` | `ControlsHistory` autoritativa de Go (hoy `telemetry-rate-coordinator.ts:108-117` **sobrescribe** la `deltaHistory` que viaja en cada frame y nunca se pinta) |
| `builder_spotter.go` → `SpotterVM(mode)` | (nuevo en Overlay; hoy vive en Engineer) | Modo longitudinal vs lateral según capability |
| `builder_damage.go` → `DamageVM` | `widget-types/car-damage-numbers`, `car-damage-visual` | Lectura de daños (hoy `damage-reader.ts`) |

*Modificar por ciclo:* el widget correspondiente para consumir el ViewModel tipado; `overlay-shadow-comparator.ts` para incorporar el feature al comparador.

*Borrar por ciclo:* la lógica de dominio del widget migrado — **solo** cuando su gate de paridad está verde y **solo** su rama, no el archivo compartido.

**Comportamiento compatible:** hasta el final de F8 conviven las dos rutas; el flag es **por feature** (`overlayV2Features: ["standings", "delta", ...]`), no global.

**Tests ANTES (por builder):** golden compartido Go↔TS del ViewModel; `<feature>-parity.test.ts` sobre 1/20/104 vehículos con los mocks del Studio **y** con un fixture de sesión real (los mocks del Studio traen 16 claves que el adapter nunca escribe — ese camino de verificación falso es precisamente lo que hay que romper).
**Tests DESPUÉS (por builder):**
- `Test<Feature>VMGolden` (Go) y `<feature>-view-model.test.ts` (TS) sobre el mismo golden.
- `<feature>-domain-free.test.ts` — **cero lógica de dominio** bajo `widget-types/**`: sin cálculo de orden, sin fallback de referencia, sin nombres de simulador. Aserción por AST o por lista de identificadores prohibidos.
- Playwright de regresión visual del widget con v1 y con v2, misma captura.

**Observabilidad:** `overlay_shadow_mismatches_total{feature,field}` — el contador que autoriza la conmutación de cada feature; `overlay_v2_feature_enabled{feature}`.

**Rollback:** por feature, quitando el nombre del array del flag. Reversión de un builder = revert de 1–2 PRs.

**Criterios de éxito (por builder):** `overlay_shadow_mismatches_total{feature}` = 0 durante N sesiones; sin regresión visual Playwright; el test `domain-free` verde; el payload agregado de v2 con todos los builders sigue < 64 KiB con 104 coches.

**Legacy que se borra:** la rama de dominio de cada widget migrado, y solo la suya. Prueba de paridad: el gate de shadow de **ese** feature.

---

### F9 — Retirada del legacy del frontend

| Campo | Contenido |
|---|---|
| **Objetivo** | Eliminar el último kilómetro que destruye la semántica: adapter legacy, snapshot sin tipar, lectores por string, histories duplicadas y el propio comparador. |
| **Depende de** | **Todos** los widgets productivos **y la ruta OBS** con paridad verde en F8. |
| **Tamaño / riesgo** | **M** / **Alto** (es el punto sin retorno barato). |

**Alcance exacto**

*Borrar:*
- `frontend/src/overlay/projection/overlay-projection-adapter.ts` (+ test) — **~1,68 ms de media a 104 coches [MEDIDO]**.
- `frontend/src/overlay/core/telemetry-snapshot.ts` — `scoring: Record<string, unknown>` (`:39`), 101 lecturas por string, 16 claves fantasma.
- `frontend/src/overlay/widget-types/shared/scoring-readers.ts` (+ test).
- `frontend/src/overlay/widget-types/input-telemetry/input-telemetry-accumulator.ts` (+ test) — estado global de módulo, dominio duplicado.
- Las *histories* de dominio de `frontend/src/overlay/core/derived-telemetry-store.ts` (se conservan **solo** los buffers de animación visual).
- `frontend/src/overlay/telemetry-shadow/overlay-shadow-comparator.ts` y `overlay-shadow-sanitizer.ts` (+ tests) — cumplida su función.
- `frontend/src/overlay/core/telemetry-rate-coordinator.ts:108-117` (la sobrescritura de `deltaHistory`).
- `frontend/src/overlay/projection/overlay-projection-v1.ts` si no queda ningún consumidor.
- En Go: `internal/telemetry/projection/overlay/v1.go` **solo si** la ruta v1 ya no se publica; si algún consumidor externo (OBS de usuario con versión antigua) la necesita, se conserva un ciclo más marcada `// Deprecated:`.

*Crear:* ampliación de `frontend/src/overlay/transports/legacy-retirement.test.ts` con los nombres retirados (`TelemetrySnapshot`, `overlay-projection-adapter`, `scoring-readers`, `input-telemetry-accumulator`, `overlay-shadow-comparator`).

**Comportamiento compatible:** ninguno — es la retirada. Requisito: la versión anterior debe seguir publicable durante al menos un ciclo de nightly, y la rama legacy debe permanecer en git.

**Tests ANTES:** todos los gates de F8 verdes, incluida la ruta OBS; inventario `grep -r "TelemetrySnapshot" frontend/src --include=*.ts*` = solo los archivos a borrar.
**Tests DESPUÉS:**
- `legacy-retirement.test.ts` — cero importadores de `TelemetrySnapshot` y cero apariciones de los strings retirados en TS de producción.
- `TestOverlayV1NoLongerPublished` (Go) — el runtime no instancia el hub v1.
- Suite frontend completa + Playwright de **todos** los widgets productivos.
- Benchmark: parse+decode+adapter de 5,89 ms @104 → parse de `OverlayFrame v2` (objetivo **< 0,25 ms**, línea base medida 0,211 ms).

**Observabilidad:** desaparición de `overlay_shadow_mismatches_total` (ya no hay dos rutas); `overlay_v2_parse_duration_ms{p99}` en el frontend como métrica permanente.

**Rollback:** **no trivial.** Mitigación: (a) la rama legacy permanece en git y se etiqueta; (b) existe una release anterior publicable durante un ciclo completo de nightly; (c) el borrado se hace en 2 PRs (primero dejar de publicar v1, después borrar los archivos), de modo que el primero es revertible barato.

**Criterios de éxito:** cero importadores de `TelemetrySnapshot`; cero lógica de dominio bajo `widget-types/**` verificado por test; parse frontend p99 < 1 ms con 104 coches en WebView2; ~2.000 líneas menos; sin regresión visual Playwright en ningún widget.

**Legacy que se borra:** el listado completo de §6, con su condición de paridad.

---

### F10 — Capabilities de extremo a extremo y multi-simulador

| Campo | Contenido |
|---|---|
| **Objetivo** | Que un simulador nuevo entre sin tocar widgets, y que la degradación sea declarada en vez de accidental. |
| **Depende de** | F8. |
| **Tamaño / riesgo** | **L** / **Medio**. |

**Alcance exacto**

*Crear:*
- `internal/telemetry/fusion/` — **promoción explícita** (11 §12.4 lo pide y §12.6 lo deja implícito): `lmu.Fusion` sube de `drivers/lmu` a paquete compartido; `ObservationSource` cerrado → `SourceSlotID` abierto; dos fuentes → lista ordenada; `ruleFor` lineal con `panic` → índice por `SignalID`.
- `internal/telemetry/capability/` — `Supported` (estable por driver) / `Available` (por sesión) / `Modes` (`spatial: xyz|xy|lap-distance|none`; `delta: personal-best|session-best|previous-lap|optimal`; `standings: official|reconstructed`; `gaps: official|estimated`), con `spatial.longitudinal` y `spatial.lateral` separados.
- `internal/telemetry/driver/registry.go` — `DriverManager` multi-candidato genérico.
- `internal/telemetry/drivers/simx/` (driver sintético de prueba, **solo en test o tras flag de diagnóstico**): `driver.go`, `reader_windows.go`, `reader_stub.go`, `format.go`, `identity.go`, `capabilities.go`.

*Modificar:*
- `internal/app/telemetry_core_runtime.go` (`:146-149`, `:154`, `:170-177`) — composition root genérico: `ObservationMapper` en vez de `lmu.Observation`; `SourceStatus` derivado del descriptor; el manifiesto de Engineer **derivado del driver activo** (hoy `CapabilitySpatial: Supported` está hardcodeado y con SimX sería mentira).
- `internal/telemetry/projection/engineer/*` y `messagepolicy/*` — el mecanismo `ReasonCapabilityUnavailable` ya existe (`contract.go:89`); se alimenta del driver real.
- `internal/telemetry/architecture_test.go` — casos de import para el driver nuevo, conservando `"concrete driver rejects another simulator"`.

**Comportamiento compatible:** con un único driver (LMU) el comportamiento observable no cambia; los capabilities pasan de implícitos a declarados.

**Tests ANTES:** `TestEngineerManifestIsDerivedFromActiveDriver` (falla hoy: está hardcodeado).
**Tests DESPUÉS:**
- **La prueba de 12.5 / 04 §9:** `TestSimXStartsWithoutTouchingWidgets` — el driver sintético arranca, Standings/Delta/Fuel/Controls funcionan, Spotter lateral y Weather se declaran `unsupported`, y **ningún archivo bajo `frontend/src/overlay/widget-types/**` cambia**.
- `TestSpotterFamilyDisabledWhenLateralUnsupported` — se desactiva por `ReasonCapabilityUnavailable`, no intenta emitir avisos con posiciones ausentes.
- `TestDeltaFallbackIsResolvedInGoAndDeclared` — `personal-best → session-best` resuelto en Go y declarado en el frame.
- `TestAuthorityMatrixIsExhaustiveBySignalID` — sin `panic` posible; índice completo (incorpora la fase 2 de la Opción D, 08 §7.4).
- `TestFusionSupportsNSourceSlots` — 1, 2 y 3 slots con TTL propio.

**Observabilidad:** `driver_active{sim}`, `capability_state{id,state}`, `fusion_source_state{slot,state}`, `fusion_authority_conflicts_total{signal}`.

**Rollback:** el driver sintético vive tras flag; la promoción de `fusion` es revertible mientras `drivers/lmu` conserve su fachada un ciclo.

**Criterios de éxito:** la prueba de 12.5 pasa; cero `if simulator ==` en TS y en `projection/**`; `ruleFor` sin `panic` alcanzable; ningún widget modificado por el driver nuevo.

**Legacy que se borra:** `lmu.Fusion` como paquete privado (queda una fachada delgada o desaparece), `ObservationSource` cerrado. Prueba de paridad: `fusion_test.go` migrado íntegro al paquete compartido, con los mismos casos y goldens.

---

### F11 — Cadencias y regulación antes de proyectar

| Campo | Contenido |
|---|---|
| **Objetivo** | Regular por sección **antes** de proyectar y serializar; medir en el binario real, no en prototipo. |
| **Depende de** | F6 (puede empezar con el slice; se completa tras F8). |
| **Tamaño / riesgo** | **M** / **Bajo**. |

**Alcance exacto**

*Crear:* `internal/telemetry/projection/overlayv2/cadence.go` — regulación por sección con dirty-trigger y tope:

| Sección | Cadencia inicial | Fuente |
|---|---:|---|
| player / controls / delta | 30–60 Hz | 05 §11 |
| relative / spotter | 20–30 Hz | 05 §11 |
| standings / gaps / fuel / session | 5–10 Hz o dirty-trigger con tope | 05 §11 |
| status | integrado en el full | 11 §12.2 |
| facts | inmediatos, ordenados | 05 §9 |

*Modificar:* `internal/app/telemetrytransport/publisher.go`, `frontend/src/overlay/core/telemetry-rate-coordinator.ts` (pasa a ser puramente visual).

**Comportamiento compatible:** las cadencias son configurables; el valor por defecto reproduce el comportamiento anterior hasta que la medición autorice bajarlo.

**Tests ANTES:** `BenchmarkOverlayV2ByCadence` con las cadencias planas actuales.
**Tests DESPUÉS:** `TestDirtyTriggerHasCeiling` (una sección que nunca cambia se publica al menos cada N ms); `TestCadenceDoesNotDelayFacts`; `TestRegulationHappensBeforeMarshal` (aserción sobre número de marshals por segundo).

**Observabilidad:** `overlay_v2_section_publishes_total{section}`, `overlay_v2_bytes_per_second`, `overlay_v2_dirty_skips_total{section}`.

**Rollback:** cadencias a sus valores anteriores por configuración; sin cambio de código.

**Criterios de éxito:** bytes/s medidos **en el binario real** (Wails + OBS), no en prototipo; reducción medible frente a la línea base de F6 sin regresión de fluidez percibida en Playwright/vídeo; CPU backend en el rango de 05 §10.

**Legacy que se borra:** la regulación en el frontend (`telemetry-rate-coordinator.ts`) pierde toda responsabilidad de dominio. Prueba de paridad: los ViewModels recibidos por los widgets son idénticos, solo cambia su frecuencia.

---

### F12 — Puertos futuros: Recording, Analysis post-sesión, Strategy

| Campo | Contenido |
|---|---|
| **Objetivo** | Conectar cada puerto **con** su consumidor, nunca antes. |
| **Depende de** | F7 y F9. |
| **Tamaño / riesgo** | **L** / **Medio**, y **divisible en tres issues independientes**. |

**Alcance exacto**

| Sub-fase | Alcance | Consumidor requerido |
|---|---|---|
| F12.a — Recording conectado | `internal/telemetry/recording/coordinator.go` conectado al runtime; gap markers y `Incomplete` explícitos; SQLite por sesión (`recording/sqlite/*` se conserva) | La UI de grabaciones / el catálogo de sesiones |
| F12.b — Analysis post-sesión | `internal/telemetryanalysis` + DuckDB alimentado **desde SQLite** y desde los ficheros nativos de LMU (importación, no live); `diagnostics.CaptureManager` / `captureTap` conectados para capturar fixtures de un segundo simulador | El módulo Telemetría/Analysis |
| F12.c — Strategy | Reexposición del transporte de Strategy | El Planner |

**Comportamiento compatible:** cada sub-fase es opcional e independiente; ninguna es prerrequisito de otra.

**Tests ANTES:** `TestRecordingIsNotWiredWithoutConsumer` (el guard de F4 debe seguir aceptando su estado actual hasta que se conecte).
**Tests DESPUÉS:** `TestRecordingProducesGapMarkerAndIncompleteState`; `TestRecordingNeverBlocksCore` (cola llena, `TryAccept` rechaza); `TestAnalysisImportsFromSqliteDeterministically`; `TestDuckDBIsNeverTouchedByLivePath` (regla en `architecture_test.go`).

**Observabilidad:** `recording_queue_depth`, `recording_rejected_total`, `recording_state{state}`, `analysis_import_duration_ms`.

**Rollback:** cada puerto tras su flag; desconectar no afecta al Core.

**Criterios de éxito:** ningún puerto conectado sin consumidor; la regla de arquitectura *"DuckDB fuera del camino vivo"* verde; ADR 0005 (SQLite/MCAP y DuckDB helper) sigue vigente sin enmienda.

**Legacy que se borra:** el estado *"completo, testeado y desconectado"* de `recording.Coordinator` (06 §13 #17) y de `telemetryanalysis`. Prueba de paridad: el guard de wiring deja de listarlos.

---

### F13 — Cierre: guardarraíles definitivos y documentación (fase explicitada)

> 11 §12.6 no la enumera; el plan la hace explícita porque la documentación contradictoria es uno de los riesgos citados en 11 §12.7 y el DoD de §9 no se puede firmar sin ella.

| Campo | Contenido |
|---|---|
| **Objetivo** | Dejar el repositorio con los guardarraíles ampliados y la documentación alineada con el wiring real. |
| **Depende de** | F9 (mínimo) y F10 (para las reglas multi-sim). |
| **Tamaño / riesgo** | **S–M** / **Bajo**. |

**Alcance:** ampliar `internal/telemetry/architecture_test.go` con las capas nuevas (`engine`, `identity`, `capability`, `fusion`, `overlayv2`) conservando **todos** los casos actuales; consolidar `legacy-retirement.test.ts`; reescribir `docs/telemetry-core/README.md`, retirar `runtime-fanout.md`, versionar `runtime-projections.md` como v2; cerrar el ADR 0008 con su sección de consecuencias reales; actualizar `docs/current-plan.md` y el handoff vivo.

**Tests DESPUÉS:** `TestArchitectureRulesCoverEveryTelemetryPackage` (ningún paquete de `internal/telemetry/**` sin regla de import declarada); `TestDocsDoNotReferenceRetiredSymbols` (grep sobre `docs/telemetry-core/**` contra la lista de retirados).

**Criterios de éxito:** un agente que haga `grep` en `docs/` no encuentra ningún camino muerto descrito como vivo.

---

## 4. Trazabilidad

### 4.1 Fase → defectos de 06 §13 que cierra

| Defecto | Severidad | Fase que lo cierra | Prueba de cierre |
|---|---|---|---|
| **D-01** cursores divergentes | Crítico | **F3** | `TestApplyIsAllOrNothing`, `TestApplyRetryDoesNotDivergeCursors` |
| **D-08** 256 KiB con parrilla grande | Crítico | **F1** (no terminal) + **F6** (payload compacto) | `TestRuntimePublishes104VehiclesEndToEnd`, `TestOverlayFrameV2StaysUnder64KiBWith104Vehicles` |
| **D-02** `failStop` irreversible | Crítico | **F1** | `TestPublishFailureIsNotTerminal`, `TestRuntimeRestartsAfterTransientFailure` |
| **D-04** tope acumulativo 104 identidades | Crítico | **F3** | `TestIdentityEvictionKeepsBoundedMemory`, `TestVehicleHistoryDoesNotOverflowInLongSession` |
| **D-03** un frame perdido crea identidad nueva | Grave | **F3** | `TestSlotMissingOneFrameKeepsVehicleIdentity`, `TestPlayerReappearanceKeepsControlsHistoryAndDeltaReference` |
| **D-06** frescura congelada | Grave | **F1** (status antes de cerrar hubs) + **F2** (watchdog) | `TestFrozenPipelineStopsReportingFresh`, `store.watchdog.test.ts` |
| **Engineer síncrono** (#7) | Grave | **F7** | `TestSlowEngineerDoesNotBlockDriverLoop`, `TestEngineerTimeoutIsBoundedAndCounted` |
| **D-07** `statusRevision` contigua | Medio | **F2** (tolerancia) + **F6** (status dentro del frame) | `store.test.ts` revisión no contigua; golden v2 con status embebido |
| **D-05** cambio de piloto indetectable | Medio | **F3** | `TestDriverChangeEmitsFactAndOpensNewStint` |
| **#10** huecos de facts silenciosos | Medio | **F7** | `TestFactProjectionFailureIsBoundaryNotSkip` |
| **#11** P→Q→R con firma stale | Medio | **F0** (test) + **F3** (política declarada) | `TestSessionSignatureStaleDoesNotMergeSessions` |
| **#12** histories duplicadas Go↔TS | Medio | **F8** (controls sube a Go) + **F9** (borrado) | `<feature>-domain-free.test.ts`, `legacy-retirement.test.ts` |
| **#13** sin `recover()` en ninguna frontera | Medio | **F1** (fronteras) + **F7** (consumidores) | `TestConsumerPanicDoesNotKillProcess` |
| **#14** `cloneSelfDeltaTracker` a 60 Hz | Bajo | **F3** | `BenchmarkDeriveDelta104` vs línea base F0 |
| **#15** seal SHA-256 | Bajo | **F4** | Benchmark de marshal + guard |
| **#16** RFC 7396 nunca usada | Bajo | **F4** | `legacy-retirement.test.ts` (Go y TS) |
| **#17** Fanout / facts / Recording desconectados | Bajo | **F4** (Fanout borrado) + **F12** (Recording conectado) | Guard de wiring |
| **#18** `Reducer.Run` fail-stop | Bajo | **F3** (borrado) | `go build` + guard |
| **#19** `EventID` literal `"lmu-event-1"` | Bajo | **F3** (identidades separadas) | `TestSessionIdentityHasMeaning` |
| **#20** métricas ausentes | Bajo | **F1** + **F2** + **F7** | `telemetry_fail_stop_total`, `telemetry_last_frame_age_ms`, `engineer_consume_latency_ms` |

**Escenarios de 09 §6 que dejan de fallar de forma insegura:** 9 (F1+F6), 16 (F3), 19 (F3+F7), 21 (F7), 23 (F1). Los escenarios 15 y 17 pasan de invisibles a declarados (F0+F3). El 20 pierde su ventana residual (F2+F6).

### 4.2 Fase → piezas de la tabla 11 §12.4

| Pieza (11 §12.4) | Decisión | Fase |
|---|---|---|
| LMU driver (reader, layout, format) | Conservar, adaptar a `SimDriver`/`SourceFrame` | F10 |
| REST LMU | Conservar | — (sin cambio) |
| fusion + matriz de autoridad | Modificar y promover | **F10** |
| schema (`Field`, dominios, envelope) | Conservar; fusionar `projection.Field` con `schema.Field` | F6 (unión wire) |
| catalog | Conservar y reorientar (alimenta generación) | **F5**, ampliado en F10 |
| BatchMapper | Modificar (prepare/commit, gracia, epoch desacoplado) | **F3** |
| Reducer | Conservar; eliminar `Reducer.Run` | **F3** |
| SessionCoordinator | Fusionar dentro de `Apply` | **F3** |
| derive | Modificar (autoridad única, `Authority`+`Mode`, fuel sube de TS, retirar DAG) | **F3** + **F8** (fuel) |
| Overlay Projection | Modificar → builders + `OverlayFrame v2` | **F6** + **F8** |
| Engineer Projection | Modificar (async latest-wins, facts con cursor, `boundary.go` íntegro) | **F7** |
| Strategy Projection | Modificar y aislar; fuera del transporte público | **F7**, reexposición en **F12.c** |
| Analysis Projection (live) | Eliminar | **F4** |
| `core.Fanout` | Eliminar rescatando `FactResyncRequiredError` | **F4** (rescate) → **F4** (borrado) |
| Hubs por producto | Fusionar en un Publisher parametrizado | **F6** |
| status revision | Eliminar | **F2** (tolerancia) → **F6** (integrado en el frame) |
| RFC 7396 | Eliminar (Go y TS) | **F4** |
| Seal SHA-256 | Eliminar | **F4** |
| Wails | Conservar; medir `ExecJS` y coalescer | **F6** (medición) + **F11** |
| SSE | Conservar; mismo full y cadencia configurable | **F6** + **F11** |
| legacy `TelemetrySnapshot` | Eliminar tras paridad shadow por widget | **F9** |
| frontend histories | Modificar (solo buffers de animación) | **F9** |
| Recording Coordinator | Modificar, luego conectar | **F7** (modificar) → **F12.a** (conectar) |
| SQLite | Conservar | — |
| Replay | Conservar; adaptar al commit del Engine | **F3** |
| Historical Reader | Conservar, versionado explícito | **F12.b** |
| `internal/telemetryanalysis` + DuckDB | Posponer | **F12.b** (condicionado) |
| `diagnostics.CaptureManager` / `CaptureTap` | Posponer | **F12.b** / **F10** (fixtures del 2.º sim) |

---

## 5. Orden, camino crítico y paralelismo

### 5.1 Grafo de dependencias

```text
P0 (prerrequisitos)
 └─ F0 ─┬─ F1 ─┬─ F2 ────────────────────────────────┐
        │      ├─ F4 ── F5 ─┐                        │
        │      └─ F7 ◄──────┼── (necesita F3)        │
        └─ F3 ──────────────┴─ F6 ─┬─ F8 ─┬─ F9 ─┬─ F13
                                   │      │      └─ F12 (a/b/c)
                                   └─ F11 └─ F10
```

### 5.2 Camino crítico

**P0 → F0 → F3 → F6 → F8 → F9.**
Es el camino que produce el valor central (transacción única + frame compacto + retirada del legacy) y el único que contiene una fase **L** de riesgo **Alto** (F3) y otra **L** de volumen alto (F8). F1 y F2, aun siendo urgentes por severidad, **no** están en el camino crítico: son cortas y desbloquean solo a F4/F7.

Recomendación de secuencia de arranque: **F0 → F1 → (F3 ∥ F2 ∥ F4) → F5 → F6 → (F7 ∥ F8) → F9 → (F10 ∥ F11 ∥ F12) → F13.**
Aunque F1 no esté en el camino crítico, va primero porque cierra dos defectos **Críticos** con muy poco código y porque estabiliza el runtime que F3 va a reescribir.

### 5.3 Paralelismo por worktree (AGENTS.md: nunca dos agentes sobre el mismo worktree)

| Carril | Fases | Worktree sugerido | Archivos dominados |
|---|---|---|---|
| **A — Núcleo Go** | F1 → F3 → F7 | `vantare-tc-core` | `internal/telemetry/{engine,core,identity,derive,drivers}/**`, `internal/app/telemetry_core_runtime.go` |
| **B — Limpieza y contrato** | F4 → F5 | `vantare-tc-contract` | `internal/telemetry/core/fanout.go`, `telemetrytransport/merge_patch.go`, `tools/telemetry-contract-gen/**`, `frontend/src/generated/**` |
| **C — Frontend y transporte** | F2 (parte TS) → F6 (parte TS) → F8 → F9 | `vantare-tc-frontend` | `frontend/src/telemetry-transport/**`, `frontend/src/overlay/**` |
| **D — Multi-sim** | F10 | `vantare-tc-multisim` | `internal/telemetry/{fusion,capability,driver,drivers/simx}/**` |

**Pares seguros en paralelo:** (A-F3 ∥ B-F4), (A-F3 ∥ B-F5), (A-F7 ∥ C-F8), (C-F8 ∥ D-F10 tras F8 parcial), (C-F9 ∥ nada del carril A).

**Pares prohibidos (colisión de archivo):**

| Par | Archivo en disputa |
|---|---|
| F1 ∥ F3 | `internal/app/telemetry_core_runtime.go`, `core/driver_manager.go` |
| F3 ∥ F7 | `internal/app/telemetry_core_runtime.go` (bucle de consumidores) |
| F6 ∥ F11 | `projection/overlayv2/**`, `telemetrytransport/publisher.go` |
| F2 ∥ F6 (parte TS) | `frontend/src/telemetry-transport/store.ts` |
| Dos builders de F8 sobre el mismo widget compartido | `widget-types/shared/**` |

Regla operativa: **el carril A es el propietario de `telemetry_core_runtime.go`**. Cualquier otro carril que lo necesite abre un PR pequeño contra el carril A y espera, en vez de editarlo en paralelo.

---

## 6. Cuándo borrar cada legacy

| Legacy | Fase de borrado | Condición de paridad que lo autoriza |
|---|---|---|
| `core.Fanout` (`internal/telemetry/core/fanout.go`) | **F4** | `FactResyncRequiredError` y la retención acotada portados al puerto de Engineer **con test propio**, + guard de wiring en verde + `go build ./...` |
| RFC 7396 Go (`telemetrytransport/merge_patch.go`) | **F4** | Producción pasa `nil` en ambas publicaciones (`runtime:789,793`) — verificado por grep + test de retirada por nombre |
| RFC 7396 TS (`telemetry-transport/merge-patch.ts`) | **F4** | Cero importadores productivos + `legacy-retirement.test.ts` amplía la lista de strings prohibidos |
| Seal SHA-256 (`transport.go:85,99,113,752-785`) | **F4** | Ningún consumidor lo verifica (campo sin tag JSON); sustituido por invariantes de construcción y goldens; benchmark de marshal sin regresión |
| `NewAnalysisFull` / proyección Analysis live | **F4** | Cero suscriptores del hub de Analysis; el contrato queda marcado `// Deprecated:` si sirve a F12.b |
| `Reducer.Run` | **F3** | Sin llamador (guard) y sustituido por `Apply` |
| Registro DAG de `derive` | **F3** | `AlgorithmVersion` conservado y paridad de replay por digest verde en dos pacings |
| `statusRevision` como cursor contiguo | **F2** (tolerancia) → **F6** (eliminación) | Status embebido en `OverlayFrame v2` y `store.test.ts` cubriendo revisión contigua, no contigua y retrocedida |
| Transporte público de Strategy | **F7** | Cero consumidores (grep + guard); el builder y su golden se conservan intactos |
| `overlay-projection-adapter.ts` | **F9** | **Todos** los builders de F8 con `overlay_shadow_mismatches_total{feature}` = 0 durante N sesiones, incluida la ruta OBS |
| `telemetry-snapshot.ts` | **F9** | Cero importadores; ningún widget lee `scoring[...]` por string; Playwright sin regresión en todos los widgets |
| `scoring-readers.ts` | **F9** | Cada una de las 101 lecturas por string sustituida por un campo tipado del ViewModel correspondiente |
| `overlay-shadow-comparator.ts` / `overlay-shadow-sanitizer.ts` | **F9** | Su propio contador a 0 en todas las features: el comparador se borra cuando ya no tiene nada que comparar |
| `input-telemetry-accumulator.ts` | **F9** | `ControlsHistory` de Go consumida por el widget y verificada contra golden compartido |
| Histories de dominio de `derived-telemetry-store.ts` | **F9** | Los valores mostrados proceden del frame; se conservan solo los buffers de animación, verificado por `domain-free` test |
| `telemetry-rate-coordinator.ts:108-117` (sobrescritura de `deltaHistory`) | **F9** | `DeltaVM` en paridad; la `deltaHistory` autoritativa de Go se pinta |
| `projection/overlay/v1.go` (Go) | **F9**, o un ciclo después | Solo cuando ningún cliente (incluido OBS de usuario con versión antigua) consuma v1; si hay duda, `// Deprecated:` un ciclo más |
| `telemetry-store.ts` (frontend, muerto) | **F4** | Guard de wiring confirma cero importadores productivos |
| `lmu.Fusion` privado | **F10** | `fusion_test.go` migrado íntegro al paquete compartido con los mismos casos y goldens |

Regla transversal: **ningún borrado sin (a) un test que documente que el símbolo no tiene llamador productivo y (b) un test de retirada por nombre que impida su regreso.**

---

## 7. Puertas de reevaluación (condiciones falsables)

Tomadas de `10 §8.2` y de las piezas pospuestas de la Opción D en `11 §12.1` / `08 §7.4`. Se evalúan **al terminar F9** y de nuevo **al terminar F10**.

| Pieza pospuesta | Se activa si (condición falsable) | Cómo se mide | Si se activa |
|---|---|---|---|
| **Registry generado del canonical** (fase 8 de D) | Tras completar C, añadir **un** campo al canonical sigue exigiendo edición mecánica coordinada en **más de diez** archivos | Contar archivos tocados en el PR real de la siguiente señal nueva (línea base: 47 archivos y 5 nombres para el mismo escalar, 07 §4.3) | Abrir ADR 0009 y una fase F14 de generación del canonical desde `catalog` |
| **Registry generado** (segunda condición) | Un **tercer** simulador queda confirmado en el plan a 12 meses | Decisión de producto registrada en Linear | Igual que arriba, con prioridad alta |
| **Tiers de cadencia** (multi-stream) | Un prototipo de publisher con tres cadencias mide una mejora **material** frente al frame compacto de un solo canal **en WebView2 y en OBS**, no solo en bytes | Comparar `overlay_v2_bytes_per_second`, p99 de parse y FPS percibido en las dos superficies | Ampliar F11 a tiers reales |
| **RFC 7396** | Una medición con datos vivos, un formato apto para listas y lógica de resync demuestra un ahorro **superior al 15 %** sobre el compacto | Hoy medido: **−0,15 %** sobre el compacto y **−0,55 %** sobre v1 | Reintroducir; el código está en git hasta F4, recuperable por revert |
| **Strategy en transporte público** | Existe un Planner consumidor arrancado | El guard de wiring deja de listar Strategy como huérfano | F12.c |
| **Analysis live** | Existe un producto que requiera análisis **durante** la sesión y que no se satisfaga con el Historical Reader | Requisito de producto en Linear | Reabrir con almacén columnar, nunca sobre snapshots JSON vivos |
| **Protocolo binario** (protobuf/flatbuffers/CBOR) | El parse del frame v2 supera **1 ms p99** en WebView2 con 104 coches **después** de F11 | Medición en WebView2, no en Node (hoy: 0,211 ms en Node) | Evaluar; hasta entonces, 05 §12.6 lo descarta explícitamente |
| **Volver hacia B (simplificación fuerte)** | Tras el vertical slice, la coexistencia legacy/nueva resulta ingobernable y F8 se estanca (2 builders sin conmutar tras N sesiones) | `overlay_v2_feature_enabled` estancado | La respuesta correcta es **acelerar F9**, no fusionar el núcleo (10 §8.2) |

---

## 8. Riesgos del plan y mitigaciones

| # | Riesgo | Probabilidad / impacto | Mitigación |
|---|---|---|---|
| R1 | **La migración del frontend fuera de `TelemetrySnapshot` toca todos los widgets** (24 carpetas bajo `widget-types/`) | Alta / Alto | F8 es **por feature**, con flag por feature y comparador en vivo. Nunca se migran dos widgets en el mismo PR. El orden empieza por el más simple (controls/pedals) y deja los compuestos (broadcast-tower, multiclass-relative) al final |
| R2 | **Agentes LLM editando código generado** (`frontend/src/generated/**`) | Media / Medio | Cabecera `DO NOT EDIT`, gate de CI que regenera y exige diff limpio, regla por ruta en `legacy-retirement.test.ts`, y mención explícita en `AGENTS.md` |
| R3 | **Doble camino temporal** (v1 y v2 publicándose a la vez) duplica CPU y bytes durante F6–F8 | Alta / Medio | El shadow se activa **solo** con flag y **solo** en sesiones de verificación, no en la build de testers por defecto. Métrica `overlay_v2_payload_bytes` vigilada; si el coste molesta, el shadow se ejecuta contra replay en vez de en vivo |
| R4 | **Regresiones visuales** al cambiar la fuente de los ViewModels | Alta / Alto | Playwright con captura por widget antes y después de cada builder; el gate de paridad compara **valor mostrado**, no forma del payload; `docs/overlays-studio` y los contratos visuales HTML no se tocan |
| R5 | **F3 es grande y de riesgo alto**; un revert tardío es caro | Media / Alto | Se divide en 5–8 PRs: primero la fachada `Apply` delegando en los componentes actuales (sin cambio de comportamiento), luego un componente por PR. Flag `telemetryEngineApply` durante un ciclo completo de nightly |
| R6 | **Los mocks del Studio confirman comportamiento falso** (traen 16 claves que el adapter nunca escribe) | Alta / Alto | Cada test de paridad de F8 corre con mocks del Studio **y** con fixture de sesión real; una discrepancia entre ambos es un fallo, no una diferencia aceptable. Los mocks se regeneran desde el frame v2 en F9 |
| R7 | **Límite de sesión / contexto de CI y de los agentes**: fases L no caben en una sesión | Alta / Medio | Ninguna issue supera el tamaño **M** en PRs; F3, F6, F8 y F12 se abren como issue-madre con sub-issues por PR. Cada PR deja el árbol verde por sí solo |
| R8 | **La medición prometida (WebView2/OBS) no es automatizable en CI** | Alta / Medio | Se declara como **verificación manual reproducible** con guion escrito en la issue (perfil, número de coches, duración) y captura de la métrica; los números de 05 se marcan como Node y no se extrapolan |
| R9 | **Paridad de replay rota por un cambio de identidad legítimo** en F3 | Media / Medio | El golden `canonical-integration-v1.golden.json` se regenera **una sola vez**, con nota explícita en el PR y en el changelog explicando qué IDs cambian y por qué; cualquier otra regeneración es un fallo |
| R10 | **Dos agentes sobre el mismo worktree** (prohibido por AGENTS.md) | Media / Alto | Tabla de carriles y archivos dominados de §5.3; el carril A es propietario único de `telemetry_core_runtime.go` |
| R11 | **La documentación desalineada guía a un agente al camino muerto** durante la propia migración | Alta / Medio | F4 corrige `README.md:12` y retira `runtime-fanout.md` en el mismo momento del borrado; F13 cierra el resto. Mientras tanto, las páginas afectadas llevan una nota *"vigente hasta Fx"* |
| R12 | **Sesiones de verificación insuficientes** para autorizar F9 | Media / Alto | N se define **antes** de F6 (recomendado: 5 sesiones de ≥20 min, al menos una con >40 coches y una en OBS) y se registra en la issue; si no se alcanzan, F9 no se abre |
| R13 | **El diff local se mezcla con la migración** | Media / Alto | §2.1: P0 es bloqueante; la condición de arranque de F0 es árbol limpio verificado |

---

## 9. Definición de terminado de la migración completa

Marcar solo con evidencia adjunta (log, captura de métrica, salida de test o SHA de PR).

**Corrección y fiabilidad**
- [ ] D-01, D-02, D-03, D-04, D-05, D-06, D-07 y D-08 cerrados, cada uno con su test nombrado en §4.1 en verde.
- [ ] Engineer asíncrono con timeout, métrica y `recover()`; ninguna acción de la UI puede frenar la ingesta.
- [ ] `recover()` con contador en **todas** las fronteras de consumidor (hoy: cero en todo el pipeline).
- [ ] Ningún escenario de 09 §6 con riesgo **A** o **M**.
- [ ] `telemetry_fail_stop_total` = 0 en una sesión real de 60 minutos.

**Rendimiento**
- [ ] `OverlayFrame v2` < 64 KiB con 104 vehículos (objetivo medido: 35.209 B).
- [ ] Parse + decode en el frontend < **1 ms p99** con 104 vehículos, **medido en WebView2** y confirmado en OBS.
- [ ] Cadencias reguladas antes de proyectar y serializar; bytes/s medidos en el binario real.
- [ ] `benchstat` de las etapas Go frente a la línea base congelada en F0, sin regresión no explicada.

**Arquitectura y guardarraíles**
- [ ] Una sola frontera de commit; cero cursores independientes.
- [ ] Cero lógica de dominio bajo `frontend/src/overlay/widget-types/**`, verificado por test.
- [ ] Cero símbolos exportados de `internal/telemetry` referenciados solo desde tests (guard de wiring en verde).
- [ ] Cero importadores de `TelemetrySnapshot`; test de retirada por nombre cubriendo la lista completa de §6.
- [ ] `frontend/src/generated/telemetry.ts` generado, con gate de CI que exige árbol limpio.
- [ ] `architecture_test.go` cubre todos los paquetes nuevos y **conserva** todos sus casos anteriores.
- [ ] Paridad de replay por digest SHA-256 verde en los dos modos de pacing.

**Multi-simulador**
- [ ] La prueba de 11 §12.5 / 04 §9 pasa: un driver sintético "SimX" arranca **sin tocar ningún widget**.
- [ ] Capabilities `Supported`/`Available`/`Modes` cableadas de extremo a extremo; el manifiesto de Engineer se deriva del driver activo.
- [ ] Matriz de autoridad exhaustiva por `SignalID`, sin `panic` alcanzable.

**Proceso**
- [ ] ADR 0008 en estado *Accepted* con su sección de consecuencias reales completada.
- [ ] `docs/telemetry-core/README.md` y `runtime-fanout.md` alineados con el wiring real; ninguna página describe un camino muerto como vivo.
- [ ] Cada fase integrada por el flujo `rama de issue → nightly → testers → master`, con autorización de Isaac en las dos promociones.
- [ ] Handoff vivo y `docs/current-plan.md` actualizados; changelog con la nota de usuario de cada lote.
- [ ] Sin regresión visual Playwright en ningún widget productivo.

---

## Anexo — Primeras issues sugeridas (orden de apertura)

| Orden | Issue sugerida | Fase | Tamaño |
|---|---|---|---|
| 1 | *"Promocionar el diff local de delta nativo LMU (Go + goldens) en su propia rama"* | P0.2 | M |
| 2 | *"Telemetry Core: red de seguridad — test de 104 vehículos extremo a extremo y benchmark versionado"* | F0 | M |
| 3 | *"Telemetry Core: el fallo de publicación o de consumidor deja de ser terminal"* | F1 | M |
| 4 | *"ADR 0008 — frontera única de commit, aislamiento de consumidores y OverlayFrame v2"* | P0 | S |
| 5 | *"Telemetry Core: watchdog de frescura en backend y store"* | F2 | S |
| 6 | *"Telemetry Core: guard de wiring y retirada de Fanout, RFC 7396 y seal"* | F4 | M |
