# Spec (SDD · SPECIFY): Telemetría Go-first híbrida — frontera única de commit, consumidores aislados y `OverlayFrame v2`

Fecha: 2026-08-19. Issue: ISA-372 (TC-ARCH-02). Rama: `vantareapp/isa-372-tc-arch-02-sdd-y-plan-de-migracion-go-first-en-shadow`. Base: `origin/nightly@7a92241d`.
Autores: Isaac (decisión), Fable (redacción, orquestación), Sol 5.6 (borrador SPECIFY previo, contrastado en `docs/research/telemetry-architecture-2026/13-contraste-sol-isa372.md`).
Fuente de evidencia: ISA-371 — `docs/research/telemetry-architecture-2026/00..13` (rama `isa-371`, commit `9be5bf5b`).
Estado SDD: **SPECIFY redactado → PLAN redactado → TASKS redactadas (primera ola)**. Aprobación humana pendiente por gate (ver §14).

---

## 1. Objetivo

Evolucionar la telemetría de Vantare para que:

1. un simulador nuevo entre con un driver propio **sin modificar widgets existentes**;
2. `missing`, `stale`, `invalid`, procedencia, identidad y reconnects se conserven de extremo a extremo;
3. Overlays, Engineer/Spotter, Recording y Strategy consuman **productos preparados por Go** (ViewModels tipados);
4. Telemetry Analysis siga siendo consumidor **post-sesión** sobre almacenamiento columnar, fuera del transporte visual vivo;
5. desaparezcan las copias, publicaciones y lógica de dominio duplicadas del frontend;
6. la corrección y el rendimiento del camino nuevo se comparen objetivamente con el actual antes de sustituir nada;
7. el camino antiguo se retire **solo** tras demostrar paridad.

La decisión de partida (ISA-371, confianza alta) es **arquitectura híbrida Go-first (Opción C, 88/100)**: conservar íntegro el núcleo semántico que ya funciona y reemplazar la frontera operativa que hoy falla.

## 2. Evidencia que condiciona el diseño (verificada en código y medida)

Lo que **se conserva** porque resuelve problemas reales:

- `schema.Field[T]` distingue presencia, frescura y procedencia (evita el incidente histórico del delta negativo descartado y el frame de garaje que apagaba la telemetría).
- Reducer single-writer, `SessionCoordinator`, `derive` y replay determinista por digest están probados (453 tests Go, ratio 1,28:1; `architecture_test.go` impone fronteras por AST).
- La CPU de las capas Go no es el problema: reducer 28,5 µs + coordinator 30,9 µs + derive 144 µs a 64 coches.

Lo que **justifica la evolución** (defectos D-xx de `06-reliability-review.md §13`):

| ID | Defecto | Evidencia |
|---|---|---|
| D-08 | 104 coches superan el límite de 256 KiB del Hub → `ErrPayloadTooLarge` → `failStop` terminal. Rechazo medido desde **103** (Overlay) y **85** (Engineer) | `telemetrytransport/transport.go:44`; `telemetry_core_runtime.go:762-800, 846` |
| D-01 | Cinco cursores sin transacción: el reducer commitea antes que el mapper; un fallo de stage posterior deja `ErrStaleBatch` en bucle → terminal | `reducer.go:137`, `batch_mapper.go:146-149` |
| D-02 | `failStop` irreversible por causas transitorias | `runtime:846-865` |
| D-03/D-04 | Slot ausente un frame → `VehicleID` nueva (borra `ControlsHistory` y referencia de delta); tope acumulativo de 104 identidades | `batch_mapper.go:186-212`; `session_coordinator.go:27-29` |
| D-06/D-07 | Frescura congelada al publicar; `statusRevision` contiguo sobre canal que coalesce → widget congelado | `quality.go:42-47`; `store.ts:91-114` |
| — | Engineer síncrono dentro del bucle del driver bajo mutex compartido con la UI | `runtime:673` → `engineer_service.go:660-665` |
| — | Código completo y desconectado: `core.Fanout`, RFC 7396, seal SHA-256, `recording.Coordinator`, `NewStrategyLiveRuntime`, Analysis live | `grep` sin llamador productivo |
| — | Último kilómetro TS: `overlay-projection-adapter.ts` (~1,68 ms/frame @104), `scoring: Record<string, unknown>` con 16 claves fantasma, nombres rF2 (`place`, `inPits`), clases `HYPERCAR/LMP2` cableadas | `telemetry-snapshot.ts:39`; `04-multisim-model.md §1.3` |
| — | Composition root atado a LMU: `DriverManager[lmu.Observation]`, manifiesto de Engineer hardcodeado a `Supported` ×7 | `runtime:117-118, 170-177` |

Medidas (`05-performance-and-benchmarks.md`): Overlay v1 @104 = 269.573 B (15,4 MiB/s a 60 Hz); `OverlayFrame` compacto = 35.209 B (−86,9 %); `JSON.parse` 1,84 → 0,21 ms; RFC 7396 ahorra −0,55 %; parse+decode+adapter p99 7,94 ms @104.

## 3. Decisión arquitectónica

```text
 Drivers específicos (una frontera por sim)        LMU: SM 60 Hz + REST · iRacing · ACC · SimX
        │  SourceFrame (parcial, tipado, SI, source slots, quality por campo, capturedAt monotónico)
        ▼
 TelemetryEngine.Apply — ÚNICA FRONTERA DE COMMIT
   prepare → validate → reduce → derive → facts → COMMIT ATÓMICO (estado + cursor + facts)
   si cualquier paso falla: nada cambia, frame descartado y contado. NUNCA terminal.
        │  CanonicalState inmutable + []Fact
 ═══════╪═════════ FRONTERA DE FALLO (nada de lo de abajo detiene el Core) ═════════
        ├─► Overlay builders (Go): StandingsVM · RelativeVM · DeltaVM · ControlsVM · FuelVM · SessionVM · SpotterVM(mode)
        │        → OverlayFrame v2 compacto (status DENTRO) → Publisher latest-wins → Wails + SSE → store único → widgets visuales
        ├─► Engineer: latest-state async (cap 1, drop-oldest) + facts ordenados con cursor/resync, timeout + recover
        ├─► Recording: cola acotada async, gap markers, estado Incomplete explícito (conectar solo con consumidor)
        └─► Strategy: builder conservado; sin transporte público hasta que exista Planner consumidor
 Analysis: POST-SESIÓN sobre DuckDB (import desde SQLite y ficheros nativos LMU); nunca desde el frame vivo.
```

Principios no negociables:

1. Una sola adquisición por simulador activo (el shadow comparte la observación ya adquirida; nunca dos lectores).
2. Un único dueño del estado canónico y **una** frontera de commit.
3. Structs tipados; nunca `map[string]any` como modelo de dominio.
4. Unidades internas SI; la preferencia del usuario se aplica en el builder Go; el widget redondea, formatea e internacionaliza.
5. Ausente ≠ cero; las vistas conservan calidad (no `bool available`).
6. `StreamEpoch`, `SessionID`, `VehicleID`, `StintID` son conceptos distintos. "Cambio de player" no implica epoch nuevo.
7. Un commit canónico no depende del éxito de Overlay, Engineer, Strategy ni Recording.
8. Snapshots visuales pueden perder intermedios; facts ordenados no (cursor + resync explícito).
9. Toda cola es acotada y tiene política de saturación y métrica.
10. Widgets sin simulador ni dominio; `capabilities` + `modes` declarados en el frame sustituyen a cualquier fallback en TypeScript.
11. Analysis no consume el snapshot visual.
12. El shadow es temporal y nace con criterios de retirada; el legacy se borra solo tras paridad.
13. Un agente no edita código generado: cabecera `DO NOT EDIT` + gate de CI que regenera y compara.

## 4. Alcance

**Incluido (programa completo, por fases):** red de seguridad; fallo no terminal; watchdog; `TelemetryEngine.Apply`; borrado de lo desconectado + guard de wiring; contrato TS generado; `OverlayFrame v2` + builders; aislamiento de Engineer/Strategy/Recording; migración por feature con shadow; retirada del legacy TS; capabilities + driver sintético SimX; cadencias; puertos futuros; guardarraíles finales.

**Excluido de ISA-372:** implementación productiva (va en issues por fase); segundo simulador real; cambios de esquema SQLite/DuckDB; dependencias nuevas; merge/promoción/release.

## 5. Contratos (semántica vinculante; nombres orientativos para PLAN)

Reutilización declarada: `schema.Field[T]` (= `SignalState`), `envelope.Header` (epoch/sequence/cursor), dominios `schema/*`, `catalog` (reorientado a generación), `derive.FinalState`, `projection/overlay/v1` (hasta F9), `telemetrytransport.Hub` (→ Publisher), `recording.Coordinator`, `messagepolicy.ReasonCapabilityUnavailable`.

```go
// Driver y entrada
type SimDriver interface {
    Descriptor() DriverDescriptor            // id, capabilities estáticas (Supported), fuentes
    Run(ctx context.Context, sink SourceSink) error
}
type SourceSink interface{ WriteSourceFrame(context.Context, SourceFrame) error }

type SourceFrame struct {
    Source       SourceID; StreamEpoch StreamEpoch; Sequence uint64
    CapturedAt   time.Time                    // monotónico del host
    Session      SessionObservation
    Player       VehicleObservation            // puede ser missing
    Vehicles     []VehicleObservation          // parcial permitido
    Environment  EnvironmentObservation
    Availability Availability                  // por sesión/frame
}

// Calidad (se conserva schema.Field)
type SignalState[T any] = schema.Field[T]      // Value, Presence, Freshness{fresh,stale,missing,invalid}, Provenance{observed,derived,estimated}
type Authority uint8                           // native | derived | estimated  (por derivación)

// Capabilities: Supported (driver, estable) · Available (sesión) · Modes (declarados)
type Capabilities struct {
    Supported map[CapabilityID]bool            // standings, gaps, spatial.longitudinal, spatial.lateral, weather, nativeDelta, fuel, controls…
    Available map[CapabilityID]Quality
    Modes     Modes                            // spatial: xyz|xy|lap-distance|none · delta.references []DeltaReference · standings: official|reconstructed · gaps: official|estimated
}

// Estado y commit
type CanonicalState struct {
    StreamEpoch StreamEpoch; Sequence uint64; CommittedAt time.Time
    SessionID SessionID; Session SessionState
    PlayerID SignalState[VehicleID]; Vehicles []VehicleState; Environment EnvironmentState
    Capabilities Capabilities
}
type EngineResult struct{ State CanonicalState; Facts []Fact; Cursor Cursor }   // visibles A LA VEZ

// Facts
type Fact struct {
    ID FactID; StreamEpoch StreamEpoch; FactSequence uint64; CausalSequence uint64
    OccurredAt time.Time; Kind FactKind; SessionID SessionID; VehicleID VehicleID; StintID StintID
    Payload FactPayload
}

// Producto Overlay
type OverlayUpdate struct {                     // status + frame en el MISMO sobre
    DeliveryRevision uint64                     // el cliente acepta cualquier revisión mayor
    SourceStatus SourceStatus; ReconnectAttempt uint32
    Frame *OverlayFrame
}
type OverlayFrame struct {
    ContractVersion uint16; StreamEpoch StreamEpoch; SourceSequence uint64; SessionID SessionID
    GeneratedAt time.Time
    Session OverlaySession; Player PlayerInstrumentsView
    Standings []StandingRow; Relative []RelativeRow; Delta DeltaView; Fuel FuelView
    Spotter SpotterView; Capabilities Capabilities
}
type StandingRow struct { VehicleID VehicleID; Position, ClassPosition int; ClassID string; DriverName, CarNumber string
    GapSeconds SignalState[float64]; GapLaps int; PitState PitState }      // Go NO formatea texto
type RelativeRow struct { VehicleID VehicleID; GapSeconds SignalState[float64]; Side RelativeSide; Authority Authority; DisplayName string }
type DeltaView struct { Seconds SignalState[float64]; Reference DeltaReference /*efectiva*/; Requested DeltaReference; Available []DeltaReference; Trend DeltaTrend }
```

```ts
// Contrato TS: GENERADO desde los tipos wire Go (F5). Prohibido editar a mano.
export interface OverlayUpdateV2 { readonly deliveryRevision: number; readonly sourceStatus: SourceStatus; readonly reconnectAttempt: number; readonly frame: OverlayFrameV2 | null }
export interface OverlayFrameV2 { readonly contractVersion: number; readonly streamEpoch: string; readonly sourceSequence: number; readonly sessionId: string; readonly generatedAt: string
  readonly session: OverlaySession; readonly player: PlayerInstrumentsView; readonly standings: readonly StandingRow[]; readonly relative: readonly RelativeRow[]
  readonly delta: DeltaView; readonly fuel: FuelView; readonly spotter: SpotterView; readonly capabilities: Capabilities }
export interface OverlayStoreV2 { readonly update: OverlayUpdateV2 | null; readonly ageMs: number /* watchdog local */ }
```

Reglas de contrato: los ViewModels llegan **preparados** (orden, selección de filas, referencia de delta resuelta y declarada, fallbacks resueltos en Go). El frontend: formato, redondeo, i18n, color, animación, interpolación y layout. Una columna configurable selecciona campos autorizados del ViewModel; no ejecuta reglas. Un concepto específico de simulador permanece privado en el driver salvo que un producto lo necesite: entonces recibe capability + tipo explícito, nunca un bag dinámico ni rama por nombre de sim.

## 6. Unidades

Driver → SI (m/s, m, s, °C, kPa, L, rad). Core en SI. Builder aplica preferencia del usuario y entrega número + unidad explícita. Widget redondea y muestra. Campos con semántica no equivalente permanecen separados (delta nativo ≠ delta derivado; ambos con `Authority`).

## 7. Runtime, aislamiento y transporte

- Frontera de commit: `SourceFrame → validate → identity/lifecycle → reduce → derive → facts → commit`. Publicación y consumidores **después**.
- Políticas de entrega:

| Consumidor | Semántica | Saturación | Puede detener Core |
|---|---|---|---|
| OverlayUpdate | status coherente + último frame | reemplazar pendiente; descartar y contar si excede límite | no |
| Engineer snapshot | último estado | reemplazar pendiente (cap 1); timeout + recover | no |
| Engineer facts | ordenados | cola acotada + `FactResyncRequiredError` + métrica | no |
| Strategy | último estado necesario | reemplazar pendiente; sin transporte público hasta consumidor | no |
| Recording | ordenado y auditable | cola acotada + gap marker + `Incomplete` | no |
| Analysis | histórico | fuera del hot path | no |

- Transporte: full snapshots compactos; regulación por sección **antes** de proyectar y serializar; Wails y SSE con el mismo payload; late join recibe el último full; pérdida de revisiones → acepta el siguiente full; RFC 7396 **no** (medido inútil); SHA-256 por frame **no**; `statusRevision` contiguo **se retira**; status dentro de `OverlayUpdate`.
- Cadencias candidatas (a medir, no aprobadas): adquisición ≤60 Hz; player/controls/delta 30–60 Hz; relative/spotter 20–30; standings/sesión/fuel 5–10 o dirty-trigger con tope; status por cambio + heartbeat; Engineer 10–20 Hz + facts inmediatos; Recording lotes async.

## 8. Comparación shadow

- Shadow **puro en Go**: la misma `lmu.Observation` ya adquirida alimenta al runtime actual (autoridad) y al engine nuevo (`SourceFrameAdapter → Engine → OverlayFrame v2`); comparador semántico con tolerancias; muestreado; auto-disable si amenaza la experiencia; sin Wails/SSE, sin store, sin Engineer, sin grabación, sin avisos.
- Complemento obligatorio: **paridad de replay por digest** sobre fixtures (determinista, gratis) — es la prueba primaria; el shadow vivo es secundario.
- Shadow **por feature en frontend** (F6/F8): `overlayV2Features` por widget, comparador existente, contador `overlay_shadow_mismatches_total{feature,field}` = 0 durante N sesiones reales autoriza la conmutación.
- Toda divergencia se clasifica: bug del nuevo / bug demostrado del actual / contrato intencional / indeterminación reloj-fixture / no comparable. Las clases 2 y 3 exigen decisión humana y test antes de tocar baseline.
- Cutover controlado con flag; rollback = volver a productor/store actual sin tocar adquisición ni datos persistidos; el flag se borra con el legacy.

## 9. Rendimiento: presupuestos (hipótesis a validar en WebView2 y OBS)

| Métrica | Objetivo | Hard gate | Línea base medida |
|---|---:|---:|---:|
| `OverlayFrame v2` @104 coches | ≤ 48 KiB | ≤ 64 KiB | 35.209 B (prototipo) |
| Core + derive + builders @104 | p95 ≤ 2 ms | p99 ≤ 4 ms | proyección+marshal v1 1,0 ms; compacto 0,31 ms |
| Parse + decode frontend @104 | p99 ≤ 1 ms (WebView2) | — | Node: 0,21 ms compacto vs 5,89 ms v1+adapter |
| Regresión vs actual, misma entrada | ≤ 10 % en p95/allocs sin aprobación | — | — |
| Consumidor lento | memoria acotada | — | — |
| Sesión larga | sin crecimiento sostenido de heap/goroutines | — | no medido aún |

Se mide 1, 20, 44 y 104 coches a 10/20/30/60 Hz; `go test -bench -benchmem -count=5` + `benchstat`; shadow con límites propios. Un benchmark sintético nunca se presenta como prueba de Wails/WebView/OBS.

## 10. Pruebas de comportamiento exigidas

| Escenario | Resultado requerido |
|---|---|
| Vantare antes que el sim / sim después | estado esperando; nuevo `StreamEpoch` coherente |
| menú / pausa / garage / pit lane / player ausente | lifecycle explícito; player missing; resto continúa |
| 1 / 20 / 44 / 104 coches | sin superar límites ni truncar en silencio; **104 no mata el runtime** |
| SM stale / REST offline / REST parcial | señales envejecen; fusión coherente; capabilities y quality correctas |
| reconnect / clock reset | nueva continuidad; identidades no mezcladas |
| Practice→Qualifying→Race (incluso con firma stale) | nuevo `SessionID`, sin fundir sesiones |
| slot desaparece un frame | identidad conservada (ventana de gracia); `ControlsHistory` y referencia de delta sobreviven |
| slot reutilizado | generación/`VehicleID` nueva |
| subscriber lento | latest-wins o cola acotada según contrato; sin crecimiento |
| secuencias perdidas | snapshot se recupera con el siguiente full; facts detectan gap |
| ventana a mitad de sesión | recibe último full |
| Engineer tarda/falla/panic | Core y Overlay continúan; contadores |
| recording falla | `Incomplete` + gap marker; Core continúa |
| payload excesivo | descarte observable + `degraded`; sin fail-stop global |
| backend congelado | frescura degrada a `stale` en < 1 s (backend y store) |

## 11. Estrategia de testing (niveles)

1. Tipos y unidades (table-driven; NaN, sentinels, rangos, SI).
2. Conformidad de drivers (suite común: monotonía de sequence, epoch, ownership de slices, identidades, campos no soportados missing, fixture → `SourceFrame`).
3. Engine (commit atómico con fault-injection en cada paso × cada error tipado; reducer single-writer; identidad sesión/vehículo/stint; facts exactamente una vez; reloj inyectado; stale y fusión parcial).
4. Productos (golden Go por contrato; golden Go↔TS para Overlay; no mutación del canonical; ViewModels con capabilities limitadas; builder fallido no detiene Core).
5. Transporte (late join, revisiones perdidas, subscriber lento, límite de payload, Wails/SSE mismo contrato, reconnect).
6. Frontend/visual (decoder estricto; store único; `<feature>-domain-free.test.ts`; paridad de datos y captura Playwright; `WidgetVisualHost` misma salida en Studio/Desktop/OBS/Workshop).
7. Shadow y cutover (misma entrada y reloj; divergencias clasificadas; carga prolongada; fallo del shadow invisible; activación/rollback; prueba real LMU).
8. Guardarraíles: `architecture_test.go` ampliado, `wiring_guard_test.go` (símbolo exportado solo en tests = fallo), `legacy-retirement.test.ts`, gate de contrato generado.

Comandos de referencia (ajustar símbolos vigentes):

```powershell
git rev-parse --show-toplevel; git branch --show-current; git rev-parse HEAD; git status --short
go test ./internal/telemetry/... ./internal/app/... -count=1
go test ./... -count=1
go test -race ./internal/telemetry/... ./internal/app/... -count=1   # cuando CGO/GCC lo permitan
go test ./internal/telemetry/core ./internal/telemetry/derive ./internal/telemetry/drivers/lmu ./internal/app/telemetrytransport ./internal/app -run '^$' -bench 'Benchmark(ReducerApply64Vehicles|SessionCoordinatorApply64Vehicles|PipelineApply64Vehicles|ParseObjectOut44Vehicles|Fusion|HubPublishSnapshot|TelemetryCoreCombined64Vehicles)$' -benchmem -count=5
go test -tags researchbench -run xxx -bench . -benchmem ./docs/research/telemetry-architecture-2026/bench/...   # baseline ISA-371
pnpm --dir frontend test; pnpm --dir frontend build; pnpm --dir frontend lint
pnpm --dir frontend test:telemetry-overlay-shadow; pnpm --dir frontend test:telemetry-cutover-runtimes
git diff --check
```

## 12. Estructura objetivo (reutiliza paquetes; nombres definitivos en PLAN)

```text
internal/telemetry/
  schema/ catalog/                 calidad, dominios, ids (catalog alimenta generación)
  engine/                          TelemetryEngine.Apply, commit.go            (nuevo)
  identity/                        slot grace, eviction, stint                 (nuevo)
  capability/                      Supported/Available/Modes                   (nuevo, F10)
  fusion/                          promoción de lmu.Fusion a N slots           (F10)
  core/ derive/                    reducer (sin Run), derive (sin DAG muerto)
  drivers/lmu/  drivers/simx/      raw + adapter; simx solo test/flag
  projection/overlay (v1 hasta F9)  projection/overlayv2 (frame, builders, cadence)
  projection/engineer (boundary.go intacto, fact_cursor)  projection/strategy (builder, sin transporte público)
  recording/                       coordinator con gap markers; conectar en F12
internal/app/
  telemetry_core_runtime.go        composición/lifecycle; failure policy; llama a Apply
  engineer_port.go                 latest-state async + facts ordenados
  telemetrytransport/publisher.go  un Publisher parametrizado (latest-wins, ReplaySnapshot)
  telemetry_shadow.go              temporal
tools/telemetry-contract-gen/      Go → TS de tipos wire (F5)
frontend/src/generated/telemetry.ts  DO NOT EDIT
frontend/src/telemetry-transport/overlay-frame-v2-store.ts · freshness-watchdog.ts
frontend/src/overlay/widget-types/** solo presentación
internal/telemetryanalysis/        post-sesión (DuckDB), separado
```

No se crea `utils`, bus genérico, plugins runtime, microservicios, event sourcing, ECS ni protocolo binario.

## 13. Límites de actuación (Always / Ask first / Never)

**Siempre:** verificar raíz/rama/HEAD/status; worktree de issue aislado; una sola adquisición; preservar calidad/freshness/procedencia/identidad; shadow sin efectos externos; medir antes de decidir frecuencia/formato; colas acotadas con métricas; tests antes de mover una frontera; rollback utilizable; ADR 0008 aprobado antes de la primera frontera que cambie; handoff y Linear actualizados tras cada decisión.

**Preguntar antes:** cambiar presupuestos de payload/latencia; añadir dependencia; cambiar esquemas Recording/SQLite; conectar Recording live; alterar contratos funcionales de Strategy/Analysis; cambiar unidades visibles; aceptar una divergencia shadow; aprobar ADR 0008; eliminar un sistema actual (F9); integrar un segundo sim real; promover a nightly/testers/master; publicar.

**Nunca:** leer el sim dos veces; dos fuentes productivas para un widget; efectos secundarios del shadow; reescritura big bang; `map[string]any` como Core; widgets consultando el simulador; missing→cero; coalescer facts; colas sin límite; detener el Core por un producto; alimentar Analysis desde Overlay; event sourcing/ECS/bus/binario sin evidencia; regenerar baselines para ocultar divergencias; borrar legacy sin cero consumidores; editar código generado a mano.

## 14. Gates y criterios de éxito

**Gate SDD:** [x] SPECIFY · [ ] aprobación Isaac · [x] PLAN redactado · [ ] aprobación PLAN · [x] TASKS primera ola · [ ] aprobación TASKS · [ ] IMPLEMENT por fases con issue propia.

**Gate de paridad (antes de F9):** fixtures 1/20/44/104; escenarios de §10; cero divergencias P0/P1 sin explicar; tolerancias documentadas; paridad visual en widgets representativos; prueba real LMU; benchmark + soak sin crecimiento; rollback probado.

**Gate de estabilidad (antes de F9):** ≥2 ciclos de Nightly internos; ≥3 sesiones reales (Practice, Qualifying, Race); ≥1 reconnect y ≥1 ventana abierta a mitad de sesión; revisión humana de métricas y divergencias.

**Gate de borrado:** v2 única fuente productiva; adapter/store/histories legacy con cero consumidores; rollback no depende de ese código; issue de retirada aprobada; tests y docs referencian solo el camino final.

**Definición de terminado (programa):** (1) Core sin imports de simulador; (2) LMU entra por la misma frontera que un segundo driver; (3) SimX no exige cambiar widgets; (4) fault injection demuestra commit atómico; (5) quality/freshness/provenance extremo a extremo; (6) epoch/session/vehicle/stint con tests independientes; (7) standings/relative/delta/fallbacks con una sola autoridad Go; (8) frontend sin ramas por sim; (9) 104 coches dentro de presupuesto; (10) late join con full; (11) Engineer lento/fallido no afecta Core/Overlay; (12) Recording falla observable; (13) facts ordenados con detección de gaps; (14) Analysis sobre histórico; (15) Strategy conserva su comportamiento productivo acordado; (16) paridad funcional y visual de widgets; (17) shadow y actual comparables y reversibles; (18) cero consumidores del legacy; (19) shadow eliminado tras cutover; (20) evidencia humana revisable por gate; (21) ADR 0004 sucedido por ADR 0008.

## 15. Preguntas abiertas y propuesta por defecto (decisión de Isaac antes de PLAN → IMPLEMENT)

1. **Diff local del native delta (P0):** promocionar en 3 issues (delta Go+goldens / delta frontend / updater) **antes** de F0. Alternativa: archivar y regenerar goldens desde HEAD limpio.
2. **Duración shadow / gate de estabilidad:** 2 Nightly + 3 sesiones reales, ampliable si hay divergencias.
3. **Presupuestos 104 coches:** los de §9 (48/64 KiB; p95 2 ms / p99 4 ms; ≤10 % regresión).
4. **Codegen Go→TS (F5):** sí, acotado a tipos wire, con gate de CI y prohibición de edición manual. Alternativa mínima: test de contrato Go↔TS que falle ante deriva.
5. **Unidades visibles:** las selecciona el builder Go según preferencias.
6. **Analysis:** post-sesión e independiente; su live requiere otra spec.
7. **Strategy:** conservar builder/contrato; retirar transporte público hasta Planner.
8. **ADR:** ADR 0008 (Proposed en esta rama) sucede/enmienda ADR 0004; bloquea la primera frontera (F1) hasta Accepted.
9. **Store frontend:** uno solo gobierna widgets durante el cutover; el segundo camino solo compara.

Hasta recibir aprobación explícita no se modifica código de producto desde ISA-372; la implementación arranca en las issues de fase (ver PLAN §Issue map).
