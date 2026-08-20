# 11 — Recomendación final (Agente H)

Fecha: 2026-08-19. Base: 01–08, `bench/results/*`, revisión cruzada 09, matriz de decisión 10.
Rama `vantareapp/isa-338-retirar-los-ultimos-confirm-nativos`, HEAD `08e316c1`, working tree sucio tratado como **observado, no integrado**.

---

## 12.1 Veredicto

**DECISIÓN: Arquitectura híbrida (Opción C), 88/100.**
**CONFIANZA: alta** en la dirección; **media** en los números absolutos de rendimiento, que describen una implementación aún no construida y no medida en WebView2 ni en OBS.

Vantare debe **conservar íntegro el núcleo semántico que ya funciona** —drivers específicos, fusión multi-fuente con TTL monotónico, calidad por campo, identidad canónica, reducer single-writer, derivaciones en Go, facts ordenados y replay determinista— y **reemplazar la frontera operativa que hoy falla**: cinco cursores independientes sin transacción, publicación dentro del commit, consumidores síncronos, hubs y productos sin consumidor arrancado, payloads que superan el límite del propio transporte, y un último kilómetro en TypeScript que destruye la semántica que las siete capas anteriores construyeron.

La simplificación correcta **no** es `Driver → un struct gigante → UI`. Es **reducir autoridades y transporte sin borrar semántica**:

- `SimDriver → SourceFrame` tipado, parcial y multi-fuente;
- `TelemetryEngine.Apply` como **única** frontera lógica de commit (prepare → validar → reducir → derivar → commit atómico de estado + cursor + facts);
- `CanonicalState` en SI, con capabilities declaradas y calidad explícita;
- derivaciones en Go con **una autoridad por concepto** y fallback declarado (`Authority` + `Mode`);
- **builders Go de ViewModels por feature** → `OverlayFrame v2` compacto, full, latest-wins, con el status **dentro** del frame;
- facts ordenados con cursor propio y resync explícito;
- Engineer, Strategy y Recording **fuera** del commit, asíncronos y acotados;
- Analysis post-sesión sobre almacenamiento columnar, nunca sobre snapshots JSON vivos;
- TypeScript **generado** para los tipos wire, y widgets puramente visuales.

### Por qué no las otras tres

**No A (mantener con pequeñas correcciones) — 60/100.** Pierde por 28 puntos y pierde en el criterio de mayor peso. La razón no es opinable: de los siete escenarios que hoy fallan de forma insegura (09 §6), **cuatro no se pueden cerrar sin mover la frontera de commit, la política de identidad o el contrato de salida**, y mover cualquiera de las tres deja de ser una pequeña corrección. Un sistema que declara soportar 104 vehículos (`session_coordinator.go:29`) y cuyo transporte rechaza a partir de 103 **[MEDIDO]**, convirtiendo el rechazo en `failStop` terminal, no está correctamente dimensionado por definición.

**No B (simplificación fuerte) — 79/100.** Acierta en el diagnóstico y se pasa en el remedio. Fusionar las cuatro proyecciones en un frame único rompe un requisito de corrección verificable: `projection/engineer/boundary.go:36-52` clasifica cambios de piloto/equipo **dentro del mismo epoch** para cancelar decisiones pendientes del Engineer, algo que el Overlay no debe ver ni sufrir. Borrar el catálogo cierra la única puerta viable a la generación de contratos. Borrar el write path de Recording destruye el único diseño asíncrono con cola acotada y drop-policy del repositorio, que es justamente el patrón que hay que copiar para Engineer. Y su promesa de "cero archivos existentes modificados" para un simulador nuevo es **factualmente falsa** con el composition root actual **[VERIFICADO-H]**.

**No D (registry generado + tiers) — 85/100.** Es la dirección correcta a dos años y la inversión equivocada a seis meses. Gana en preparación futura (5/5) y en multi-sim (17/18), y pierde donde importa hoy: 2/6 en coste y riesgo de migración, porque introduce generador, registry, builders y tiers **antes** de saber qué abstraen realmente iRacing y ACC. Su propio autor pone la generación del canonical como fase 8, la última y opcional. C **incorpora sus fases 0–2** (borrar lo muerto, generar el contrato TS, generar la exhaustividad de la matriz de autoridad) y **pospone el resto con condiciones de reevaluación falsables** (10 §8.2). C es D ordenada por evidencia disponible.

---

## 12.2 Arquitectura recomendada

```text
╔══════════════════════════ DRIVERS ESPECÍFICOS (una frontera por simulador) ══════════════════════════╗
║                                                                                                      ║
║  LMU     : SharedMemory 60 Hz  +  REST 4 Hz    ─┐                                                    ║
║  iRacing : SDK telemetry 60 Hz +  session YAML  ├─► fusion compartida (N source slots)               ║
║  ACC     : SHM + UDP realtime  +  entry list   ─┘   · autoridad ordenada por señal                   ║
║  SimX    : fuente única 50 Hz                        · TTL por fuente, reloj MONOTÓNICO              ║
║                                                      · degradación fresh→stale→missing explícita     ║
║                                                      · identidad de slot con VENTANA DE GRACIA       ║
╚════════════════════════════════════════════╦═════════════════════════════════════════════════════════╝
                                             │ SourceFrame  (parcial, tipado, SI, source slots,
                                             │               quality por campo, capturedAt monotónico)
                                             ▼
╔═════════════════════════ TelemetryEngine.Apply — ÚNICA FRONTERA DE COMMIT ═══════════════════════════╗
║  1. prepare  : mapper de identidad calcula candidato SIN avanzar cursor                              ║
║  2. validate : lifecycle, cursor, epoch, identidad de run, unicidad de vehículo                      ║
║  3. reduce   : single-writer sobre estado observado (clones defensivos)                              ║
║  4. derive   : remaining · relative-gaps · self-delta · controls-history · fuel/stint                ║
║                una autoridad por concepto + Authority{native|derived|estimated} + Mode               ║
║  5. facts    : lap · pit · session · connection · driver-change (StintID)                            ║
║  ─────────────────────────────────────────────────────────────────────────────────────────────      ║
║  6. COMMIT ATÓMICO: estado + cursor del mapper + facts se hacen visibles A LA VEZ                    ║
║     Si CUALQUIER paso falla: nada cambia, se descarta el frame y se cuenta. NUNCA terminal.          ║
╚════════════════════════════════════════════╦═════════════════════════════════════════════════════════╝
                                             │ CanonicalState inmutable + []Fact del mismo commit
    ┌────────────────────────────────────────┼─────────────────────────────────┬────────────────────┐
    │                                        │                                 │                    │
    │  ══════ FRONTERA DE FALLO ═══ (todo lo de abajo puede fallar sin detener el Core) ═════════    │
    │                                        │                                 │                    │
    ▼                                        ▼                                 ▼                    ▼
Overlay builders (Go)              Engineer port                      Recording port        Strategy builder
feature-oriented                   latest-state async (cap 1,         cola acotada async    (SOLO si hay
· StandingsVM  · RelativeVM        drop-oldest) + facts               · batch               consumidor
· DeltaVM      · ControlsVM        ordenados con cursor               · gap markers         arrancado)
· FuelVM       · SessionVM         · timeout + recover                · estado degradado    · sin transporte
· SpotterVM(mode)                  · métrica de latencia              · nunca finge          público hoy
    │                                        │                          continuidad              │
    ▼                                        ▼                                 ▼                  ▼
OverlayFrame v2 COMPACTO             EngineerService                    SQLite por sesión    (in-process)
35 KB @104 coches [MEDIDO]           (spotter, penalties, …)                  │
status DENTRO del frame                                                       ▼
    │                                                                  Historical Reader
    │  cadencias reguladas ANTES de proyectar y serializar:                    │
    │    player/controls/delta ..... 30–60 Hz                                  ▼
    │    relative/spotter .......... 20–30 Hz                        ┌──────────────────────┐
    │    standings/gaps/fuel/sesión . 5–10 Hz o dirty-trigger        │ Analysis POST-SESIÓN │
    │    status .................... integrado en el full            │ DuckDB columnar      │
    │    facts ..................... inmediatos, ordenados           │ + adapters de los    │
    ▼                                                                │   ficheros nativos   │
Publisher compartido (una implementación, instancia por producto activo)      │   de LMU         │
· latest-wins  · retiene último full  · nunca bloquea al productor   └──────────────────────┘
· ReplayStatus() + ReplaySnapshot()   · descarta y cuenta si excede límite      ▲
    ├──────────────────────────┬────────────────────────────────────────────────┘
    ▼                          ▼                                          (import, no live)
 Wails / WebView          SSE / OBS (loopback)
    └────────────┬─────────────┘
                 ▼
   frontend: contrato TS GENERADO  →  UN store inmutable (referencia estable por frame)
                 │                      · watchdog de edad local (capturedAt vs Date.now)
                 │                      · acepta el siguiente full tras un hueco
                 ▼
   widgets: formato · redondeo · interpolación · animación · color · layout · i18n
            CERO dominio · CERO fallbacks · CERO nombres de simulador
```

**Fronteras de fallo, explícitas:**

- **Dentro del commit**: solo adquisición, validación, identidad, reducción, derivación y facts. Un fallo aquí descarta el frame, incrementa un contador y **no cambia nada**. Nunca es terminal.
- **Fuera del commit**: builders, publicación, Engineer, Strategy, Recording. Si Overlay falla, el Core conserva el último estado, publica `degraded` y sigue. Si Engineer tarda, pierde frames intermedios por coalescing. Si Recording no puede seguir, escribe un **gap marker** y declara la grabación `Incomplete`; jamás finge continuidad.
- **`recover()` por frontera de consumidor**, con contador. Hoy no hay ninguno en todo el pipeline **[VERIFICADO-H]**.

---

## 12.3 Contratos propuestos

### 12.3.1 Go (pseudocódigo)

```go
// ───────────────────────────── Driver ─────────────────────────────
type SimDriver interface {
    ID() SimID                                   // "lmu" | "iracing" | "acc" | "simx"
    Detect(ctx context.Context) (bool, error)
    Capabilities() DriverCapabilities            // ESTABLE por driver/versión
    Run(ctx context.Context, out chan<- SourceFrame) error
    Runtime() driver.RuntimeSnapshot             // estado por fuente
}

// SourceFrame: lo que emite un driver. Parcial por diseño; el Engine no conoce sims.
type SourceFrame struct {
    Driver      SimID
    SourceSeq   uint64                 // orden dentro del stream del driver
    CapturedAt  time.Time              // wall clock, solo para mostrar
    Elapsed     time.Duration          // MONOTÓNICO: TTL y freshness se calculan con esto
    Sources     []SourceHealth         // {slot, state, ageMs} — llega hasta el frame
    SimTime     SignalState[time.Duration]
    Session     SourceSession          // parcial
    Player      SourcePlayer           // parcial
    Vehicles    []SourceVehicle        // parciales, con SourceKey estable (mID, CarIdx, CarIndex…)
    Environment SourceEnvironment      // parcial
    Native      NativeExtensions       // punteros tipados por sim, nil si no aplica
}

type SourceHealth struct {
    Slot   SourceSlotID   // "shm" | "rest" | "udp-realtime" | "session-yaml"
    State  SourceState    // unknown | live | stale | offline
    AgeMS  int64
}

// ───────────────────────────── Calidad ─────────────────────────────
// Se REUTILIZA schema.Field[T] tal cual, ampliado con autoridad y fuente.
type SignalState[T comparable] struct {
    Value      T
    Present    bool
    Provenance Provenance     // unknown | observed | derived | estimated
    Freshness  Freshness      // missing | fresh | stale | invalid
    Authority  Authority      // native | derived | estimated | unavailable
    Source     SourceSlotID   // trazabilidad: qué fuente ganó
}

// ───────────────────────────── Capabilities ─────────────────────────────
type CapabilityID string   // "standings" "controls" "energy.fuel" "progress.lap-distance"
                           // "spatial.longitudinal" "spatial.lateral" "gaps.official"
                           // "delta.native" "weather" "standings.multiclass" "incidents"

type CapabilityState uint8 // Unknown | Supported | Degraded | Unsupported

type Capabilities struct {
    Supported DriverCapabilities   // ESTABLE: lo que el driver puede dar
    Available SessionCapabilities  // POR SESIÓN: lo que esta sesión está entregando
    Modes     CapabilityModes      // spatial: xyz|xy|lap-distance|none
}                                  // delta: personal-best|session-best|previous-lap|optimal
                                   // standings: official|reconstructed · gaps: official|estimated

// ───────────────────────────── Estado canónico ─────────────────────────────
type CanonicalState struct {
    StreamEpoch uint64        // SOLO continuidad del stream (reconnect, wrap, reinicio)
    Sequence    uint64
    CapturedAt  time.Time
    SessionID   SessionID     // sesión del simulador
    StintID     StintID       // NUEVO: tramo entre paradas / cambios de piloto
    PlayerID    SignalState[VehicleID]
    Capabilities Capabilities
    Sources     []SourceHealth
    Session     SessionState
    Vehicles    []VehicleState   // ordenado por el Core, NO por el orden de slots del sim
    Derived     DerivedState     // remaining · gaps · delta · controls history · fuel
    Native      NativeExtensions
}

// ───────────────────────────── Salida a producto ─────────────────────────────
type OverlayFrame struct {
    Version      uint16              `json:"v"`
    StreamEpoch  uint64              `json:"epoch"`
    Sequence     uint64              `json:"seq"`
    CapturedAtMS int64               `json:"capturedAtMs"`
    Status       OverlayStatus       `json:"status"`        // DENTRO del frame
    Capabilities OverlayCapabilities `json:"capabilities"`  // declaradas, no inferidas
    Sources      []SourceHealthView  `json:"sources"`
    Player       PlayerView          `json:"player"`
    Session      SessionView         `json:"session"`
    Standings    []StandingRow       `json:"standings"`     // YA ordenadas
    Relative     []RelativeRow       `json:"relative"`      // YA seleccionadas y ordenadas
    Delta        DeltaView           `json:"delta"`
    Controls     ControlsView        `json:"controls"`
    Fuel         FuelView            `json:"fuel"`
    Spotter      SpotterView         `json:"spotter"`
}

// Compactación deliberada: calidad AGREGADA por fila (stale) en vez de 4 claves JSON
// por campo × 28 campos × N vehículos. Medido: 35.209 B vs 269.573 B a 104 coches.
type StandingRow struct {
    VehicleID       string   `json:"id"`
    Position        int      `json:"pos"`
    ClassPosition   *int     `json:"clsPos,omitempty"`
    Number          string   `json:"num,omitempty"`
    DriverName      string   `json:"drv,omitempty"`
    TeamName        string   `json:"team,omitempty"`
    Class           string   `json:"cls,omitempty"`
    CompletedLaps   int      `json:"laps"`
    BestLapSeconds  *float64 `json:"best,omitempty"`   // nil = ausente, NUNCA 0
    LastLapSeconds  *float64 `json:"last,omitempty"`
    GapDisplay      string   `json:"gap"`              // resuelto en Go, incluido "+1 vuelta"
    IntervalDisplay string   `json:"int"`
    InPit           bool     `json:"pit,omitempty"`
    IsPlayer        bool     `json:"me,omitempty"`
    Stale           bool     `json:"stale,omitempty"`
}

type RelativeRow struct {
    VehicleID  string   `json:"id"`
    Relation   Relation `json:"rel"`                 // ahead | player | behind
    Position   int      `json:"pos"`
    Number     string   `json:"num,omitempty"`
    DriverName string   `json:"drv,omitempty"`
    Class      string   `json:"cls,omitempty"`
    GapSeconds *float64 `json:"gap,omitempty"`
    GapDisplay string   `json:"gapText"`
    LapDelta   int      `json:"lapd,omitempty"`
    Mode       RelativeMode `json:"mode"`            // official-gap | estimated-lap-distance
    InPit      bool     `json:"pit,omitempty"`
    IsPlayer   bool     `json:"me,omitempty"`
}

type DeltaView struct {
    RequestedReference DeltaReference   `json:"requested"`
    SelectedReference  DeltaReference   `json:"selected"`   // la que realmente se usó
    Available          []DeltaReference `json:"available"`
    ValueSeconds       *float64         `json:"s,omitempty"`
    Display            string           `json:"text"`
    Trend              DeltaTrend       `json:"trend"`      // gaining|losing|neutral|unavailable
    Authority          Authority        `json:"authority"`  // native | derived
    Fallback           bool             `json:"fb,omitempty"`
    Stale              bool             `json:"stale,omitempty"`
}

// ───────────────────────────── Facts ─────────────────────────────
type Fact struct {
    StreamEpoch uint64      `json:"epoch"`
    Sequence    uint64      `json:"seq"`      // commit que lo produjo
    FactSeq     uint64      `json:"factSeq"`  // cursor ordenado INDEPENDIENTE
    OccurredAt  time.Time   `json:"at"`
    Kind        FactKind    `json:"kind"`
    SessionID   SessionID   `json:"session"`
    StintID     *StintID    `json:"stint,omitempty"`
    VehicleID   *VehicleID  `json:"vehicle,omitempty"`
    Payload     FactPayload `json:"data,omitempty"`   // unión TIPADA por Kind, no `any`
}
```

`NativeExtensions` es una unión de namespaces tipados (`*LMUNative`, `*IRacingNative`, `*ACCNative`), nunca `map[string]any` ni `json.RawMessage` sin tipar. No se serializa al Overlay salvo que un builder la convierta en concepto de producto. **Regla de promoción**: una señal nativa asciende al canonical común cuando **dos** simuladores la exponen con semántica equivalente, no solo con nombre parecido. **Regla de consumo**: ningún widget del catálogo general puede leer `Native.*`; solo widgets declarados "específicos de simulador", y un test de arquitectura lo verifica.

### 12.3.2 TypeScript (generado desde los tipos wire Go)

```ts
// GENERATED — DO NOT EDIT. Source: internal/telemetry/projection/overlay/v2.
export type Freshness  = "missing" | "fresh" | "stale" | "invalid";
export type Authority  = "native" | "derived" | "estimated" | "unavailable";
export type DeltaReference = "personal-best" | "session-best" | "previous-lap" | "optimal";
export type SpatialMode = "xyz" | "xy" | "lap-distance" | "none";

export interface OverlayFrameV2 {
  readonly v: 2;
  readonly epoch: number;
  readonly seq: number;
  readonly capturedAtMs: number;
  readonly status: {
    readonly state: "waiting" | "live" | "paused" | "stale" | "degraded" | "disconnected" | "error";
    readonly ageMs: number;
    readonly reconnectAttempt?: number;
    readonly message?: string;
  };
  readonly capabilities: Readonly<Record<string, "unknown" | "supported" | "degraded" | "unsupported">>;
  readonly modes: { readonly spatial: SpatialMode; readonly gaps: "official" | "estimated";
                    readonly standings: "official" | "reconstructed" };
  readonly sources: readonly { readonly slot: string; readonly state: string; readonly ageMs: number }[];
  readonly player: PlayerView;
  readonly session: SessionView;
  readonly standings: readonly StandingRow[];
  readonly relative: readonly RelativeRow[];
  readonly delta: DeltaView;
  readonly controls: ControlsView;
  readonly fuel: FuelView;
  readonly spotter: SpotterView;
}

export interface StandingRow {
  readonly id: string; readonly pos: number; readonly clsPos?: number;
  readonly num?: string; readonly drv?: string; readonly team?: string; readonly cls?: string;
  readonly laps: number; readonly best?: number; readonly last?: number;
  readonly gap: string; readonly int: string;
  readonly pit?: boolean; readonly me?: boolean; readonly stale?: boolean;
}

export interface DeltaView {
  readonly requested: DeltaReference; readonly selected: DeltaReference;
  readonly available: readonly DeltaReference[];
  readonly s?: number; readonly text: string;
  readonly trend: "gaining" | "losing" | "neutral" | "unavailable";
  readonly authority: Authority; readonly fb?: boolean; readonly stale?: boolean;
}

export function decodeOverlayFrame(raw: unknown): OverlayFrameV2 | DecodeError;

// ── Store: UNO. Sin adapter, sin TelemetrySnapshot, sin histories locales. ──
export type TelemetryStore = {
  subscribe(fn: (frame: OverlayFrameV2 | null) => void): () => void;
  current(): OverlayFrameV2 | null;   // referencia ESTABLE por frame (useSyncExternalStore)
};

// Reglas del store, verificables por test:
//  · conserva la última referencia válida por (epoch, seq);
//  · ante un hueco de seq acepta el siguiente full — no reconstruye deltas;
//  · ante cambio de epoch limpia SOLO el estado dependiente del stream;
//  · WATCHDOG: recalcula status.ageMs con reloj local contra capturedAtMs, de modo que
//    un backend congelado deja de aparecer "fresh" aunque no llegue ningún frame nuevo.
export function can(frame: OverlayFrameV2, cap: string): boolean;
```

### 12.3.3 Qué se reutiliza y qué es nuevo

| Pieza | Estado | Detalle |
|---|---|---|
| `schema.Field[T]` (`schema/quality.go:42-58`) | **Reutilizado, ampliado** | Se le añaden `Authority` y `Source`. El constructor validante (`ErrMissingValue`) se conserva sin cambios: es la garantía que hace inexpresable el bug del delta negativo |
| `schema/{session,standings,energy,spatial,pit,controls,vehicle,weather,wheels,identity}` | **Reutilizados** | Los tipos nominales impiden mezclar unidades. **No** se fusionan en un paquete único: el coste de los imports es trivial frente al valor del tipado |
| `envelope.Header`, `schema.Cursor`, `schema.Clock` | **Reutilizados** | `Cursor.Epoch` pasa a significar exclusivamente `StreamEpoch`; `SessionID`/`VehicleID`/`StintID` viajan como identidades de dominio separadas |
| `envelope.Snapshot[T]` con clon forzado (`types.go:49-64`) | **Reutilizado** | Cero aliasing hacia consumidores; es lo mejor resuelto del sistema |
| `core.Reducer` y sus 9 errores tipados | **Reutilizado** dentro del Engine | Se elimina `Reducer.Run` (no usado y con fail-stop al primer rechazo) |
| `core.SessionCoordinator` | **Reutilizado** dentro del Engine | Se conservan high-water de vueltas y presencia continua para pits; se elimina la revalidación duplicada del cursor y su commit independiente |
| `derive.FinalState` y las 4 derivaciones | **Reutilizadas** | Se añaden `Authority`/`Mode`, fallbacks declarados y la derivación de fuel/stint que hoy solo existe en TypeScript |
| `lmu.Fusion` + matriz de autoridad | **Reutilizada, promovida** | Sube de `drivers/lmu` a paquete compartido; `ObservationSource` cerrado → `SourceSlotID` abierto; dos fuentes → lista ordenada; `ruleFor` lineal con `panic` → índice por `SignalID` |
| `lmu.BatchMapper` | **Reutilizado, reubicado** | Su lógica de identidad y clasificación de frames no mapeables se conserva **literalmente**; deja de ser dueño de cursor independiente y gana ventana de gracia |
| `projection/overlay` v1 | **Base del v2** | El proyector se convierte en un conjunto de builders por feature; el decoder TS pasa a generarse |
| `projection/engineer` (contract, boundary, adapter) | **Reutilizado** | `boundary.go` y `CapabilityState` son la referencia: `CapabilityState` se **promueve a transversal** |
| `telemetrytransport.Hub` | **Reutilizado, parametrizado** | Latest-wins, sin goroutines, retención del último full y notificación no bloqueante son correctos. Se elimina la rama `delta`, el seal, el escáner de claves y la contigüidad de `statusRevision`; se añade `ReplaySnapshot()` |
| `ServeWails` / `SSEHandler` | **Reutilizados** | Requisito de producto no negociable (ventanas nativas + OBS) |
| `recording/sqlite`, `replay`, `HistoricalStore` | **Reutilizados** | Replay da paridad determinista por digest en dos pacings; el Historical Reader ya está vivo en diagnósticos |
| `architecture_test.go` | **Reutilizado, ampliado** | Se conserva intacto y se le añaden reglas para las capas nuevas (sin dominio en widgets, sin nombres de sim en `widget-types/**`, sin símbolos exportados solo referenciados desde tests) |
| `TelemetryEngine.Apply` | **NUEVO** | La única frontera de commit |
| `Capabilities{Supported, Available, Modes}` | **NUEVO** | Hoy hay tres nociones incompatibles y ninguna conectada |
| `Authority` + `Mode` por concepto | **NUEVO** | Hoy el fallback del delta vive en el widget |
| Builders de ViewModel por feature | **NUEVO** | ~7 builders para los 19 widgets (comparten `StandingsVM`, `RelativeVM`, `DeltaVM`, `ControlsVM`) |
| `OverlayFrame v2` compacto + status embebido | **NUEVO** | Sustituye a `overlay.PayloadV1` + `StatusEnvelope` + adapter + `TelemetrySnapshot` |
| `StintID` | **NUEVO** | Hoy no existe, y por eso el cambio de piloto es indetectable |
| Watchdog de edad (backend y store) | **NUEVO** | Hoy la frescura se congela |
| Generación Go→TS del contrato wire | **NUEVO** | Hoy hay **0 `go:generate`** **[VERIFICADO-H]** |
| Puerto de facts para Overlay/Spotter | **NUEVO en el cableado** | El contrato ya existe y nunca se conectó |

---

## 12.4 Conservar / modificar / fusionar / eliminar / posponer

| Pieza | Decisión | Justificación |
|---|---|---|
| **LMU driver** (reader, layout, format) | **Conservar** | Es el único código que toca el simulador; offsets auditables con allow-list. Se adapta a `SimDriver`/`SourceFrame` |
| **REST LMU** | **Conservar** | Aporta identidad y metadatos que la SM no da con fiabilidad; cadencia y TTL propios (250 ms / 2 s) |
| **fusion + matriz de autoridad** | **Modificar y promover** | Generalizar a N source slots y lista ordenada de fuentes; índice por `SignalID` en vez de búsqueda lineal con `panic`. iRacing y ACC tienen el mismo problema multi-fuente: es el caso general, no una peculiaridad de LMU |
| **schema** (`Field`, dominios, envelope) | **Conservar; modificar solo la unión wire** | Se conserva el tipado nominal y la calidad. Se fusiona `projection.Field` con `schema.Field` (hoy son gemelos y cada señal se escribe dos veces) |
| **catalog** | **Conservar y reorientar** | No borrar (B se equivoca): es la única fuente declarativa y ya sabe generar (`Markdown()`). Pasa a alimentar la generación de contratos y de exhaustividad de la matriz |
| **BatchMapper** | **Modificar** | Prepare/commit: no avanza cursor hasta que el Engine commitea. Ventana de gracia antes de declarar vacante un slot. "Cambio de player" deja de implicar epoch nuevo |
| **Reducer** | **Conservar** | Single-writer, invariantes de cursor/identidad/parrilla, clones defensivos. Se elimina `Reducer.Run` |
| **SessionCoordinator** | **Fusionar** | Su responsabilidad vive **dentro** de `TelemetryEngine.Apply`, sin commit ni cursor propios. Se conservan high-water de vueltas y presencia continua |
| **derive** | **Modificar** | Una autoridad por concepto; `Authority`+`Mode` declarados; fallbacks resueltos en Go; se sube `fuelHistory` desde TypeScript; se retira el registro DAG que no ejecuta nada (el orden real está escrito a mano en `Apply`) conservando `AlgorithmVersion` para la paridad de replay |
| **Overlay Projection** | **Modificar** | Se convierte en builders por feature + `OverlayFrame v2` compacto con status embebido |
| **Engineer Projection** | **Modificar** | Entrega asíncrona latest-wins + facts ordenados, con timeout, `recover` y métrica. Se conserva `boundary.go` íntegro: expresa un requisito de corrección que ningún frame único puede dar |
| **Strategy Projection** | **Modificar y aislar** | Se conserva el builder/contrato; se desacopla su fallo del Overlay; **se deja de publicar por transporte público** hasta que exista Planner consumidor. No borrar |
| **Analysis Projection (live)** | **Eliminar** | Sin consumidor de producto; Analysis post-sesión necesita almacén columnar. Se conserva el paquete de contrato si sirve de referencia, pero sale del transporte |
| **core.Fanout** | **Eliminar, rescatando el contrato** | 1.533 líneas sin llamador productivo **[VERIFICADO-H]** que un agente confundirá con el camino vivo. **Antes de borrar**: portar `FactResyncRequiredError` y la retención acotada de facts al puerto de Engineer |
| **Hubs por producto** | **Fusionar** | Una implementación de Publisher parametrizada; instancias solo para productos con consumidor arrancado |
| **status revision** | **Eliminar** | Cursor estrictamente contiguo sobre un canal que coalesce por diseño; hoy congela el widget de forma permanente. El status viaja dentro del full |
| **RFC 7396** | **Eliminar** (Go y TS) | Nunca ejercido; **−0,55 %** medido sobre Overlay v1 y **−0,15 %** sobre el compacto |
| **Seal SHA-256** | **Eliminar** | Campo no exportado, sin tag JSON, nunca cruza un proceso, nadie lo verifica. 4 hashes por frame a 60 Hz. Se sustituye por invariantes de construcción y goldens |
| **Wails** | **Conservar** | Transporte de las ventanas nativas. Medir `ExecJS` y coalescer |
| **SSE** | **Conservar** | OBS browser source; mismo full y misma cadencia configurable |
| **legacy `TelemetrySnapshot`** | **Eliminar** tras paridad shadow por widget | `scoring: Record<string, unknown>` destruye el tipado justo donde más se escribe; obliga a `scoring-readers.ts` con alias defensivos y 16 claves fantasma; cuesta ~1,68 ms de media a 104 coches **[MEDIDO]** |
| **frontend histories** (`derived-telemetry-store`, `input-telemetry-accumulator`) | **Modificar** | Se borra el dominio duplicado (y el estado global de módulo); se conservan solo buffers de animación visual. Hoy `telemetry-rate-coordinator.ts:108-117` **sobrescribe** la `deltaHistory` autoritativa de Go, que viaja en cada frame y nunca se pinta |
| **Recording Coordinator** | **Modificar, luego conectar** | Su diseño (cola acotada, `TryAccept`, estados `Incomplete`) es el correcto y es el patrón a copiar. Faltan gap markers y política de degradación explícita |
| **SQLite** | **Conservar** | Escritura secuencial transaccional local durante la sesión; metadatos y catálogo de grabaciones |
| **Replay** | **Conservar** | Paridad determinista por digest en dos pacings; guard de arquitectura que impide que entre en producción. Se adapta al mismo commit del Engine |
| **Historical Reader** | **Conservar** | Vivo en el puente de diagnósticos; es el puente natural hacia Analysis. Versionado explícito |
| **`internal/telemetryanalysis` + DuckDB** | **Posponer** | Isla sin importadores. Es el destino correcto para Analysis post-sesión, no para el proceso vivo |
| **`diagnostics.CaptureManager` / `CaptureTap`** | **Posponer** | El `captureTap` es un campo no exportado que ningún constructor rellena. Útil para capturar fixtures de un segundo simulador: conectar cuando llegue |

---

## 12.5 Prueba multi-simulador: "SimX"

**SimX** ofrece telemetría del jugador (velocidad en km/h, rpm, marcha, pedales, combustible), standings oficiales (posición, vueltas, mejor/última vuelta, in-pit, gap al líder) y `lapDistancePct` (0–1) más la longitud de pista. **No** ofrece posición espacial de rivales, **no** ofrece meteorología y **no** ofrece delta nativo. Fuente única a 50 Hz.

### Archivos nuevos

```text
internal/telemetry/drivers/simx/driver.go          // SimDriver: detección, ciclo de vida, poll 50 Hz
internal/telemetry/drivers/simx/reader_windows.go  // acceso al transporte del sim
internal/telemetry/drivers/simx/reader_stub.go     // stub no-Windows
internal/telemetry/drivers/simx/layout.go          // offsets + allow-list de campos admitidos
internal/telemetry/drivers/simx/format.go          // bytes → SourceFrame, unidades convertidas a SI
internal/telemetry/drivers/simx/identity.go        // SessionID/VehicleID/StintID + gracia de slot
internal/telemetry/drivers/simx/capabilities.go    // declaración ESTÁTICA
internal/telemetry/drivers/simx/testdata/*.golden.json
internal/telemetry/drivers/simx/{driver,format,identity}_test.go
```

La **fusión se reutiliza** del paquete compartido (una sola fuente = un slot, configuración trivial), y la **política de identidad** usa el helper compartido de generaciones con ventana de gracia. Eso es lo que hoy no se puede hacer: `drivers/lmu/fusion.go` no es reutilizable y habría que reescribir ~550 líneas equivalentes.

### Archivos modificados

```text
internal/app/telemetry_drivers.go        // registrar la factory de simx (1 entrada)
internal/telemetry/driver/ids.go         // SimIDSimX
frontend/src/generated/telemetry.ts      // regenerado SOLO si el enum de SimID cruza diagnóstico
```

**No se modifican**: `schema/*`, el Engine, `derive/*`, los builders, el Publisher, el store, ni **ninguno de los 19 widgets**, ni CSS, ni i18n.

### Señales mapeadas

| SimX | Canonical | Nota |
|---|---|---|
| `speed_kmh` | `player.speed_mps = valor / 3,6` | Conversión **en el driver**, nunca aguas abajo |
| `engine_rpm`, `gear`, `throttle`, `brake`, `clutch` | `player.*` | Ratios normalizados a 0..1 en el driver |
| `fuel_l` | `player.fuel_liters` | |
| `cars[].position / laps / best / last / in_pit / gap_leader` | `VehicleState.*` | Standings oficiales |
| `cars[].lap_distance_pct` × `track_length_m` | `standings.lap_distance` en metros | Normalización en el driver; el canonical sigue en SI |
| `session_uid` | `SessionID` con namespace estable | |
| `car_uid` | `SourceKey` → `VehicleID` estable dentro de la sesión | |

### Capabilities declaradas

```go
DriverCapabilities{
    Standings:        Supported,
    Controls:         Supported,
    Fuel:             Supported,
    LapProgress:      Supported,   // pct → metros
    GapsOfficial:     Supported,
    Multiclass:       Unsupported,
    SpatialLongitudinal: Supported, // por lap-distance
    SpatialLateral:   Unsupported,  // ← clave para el Spotter
    DeltaNative:      Unsupported,
    Weather:          Unsupported,
    Incidents:        Unknown,
}
Modes{ Spatial: "lap-distance", Gaps: "official", Standings: "official" }
```

### Comportamiento de cada widget, sin tocar ninguno

| Widget | Comportamiento con SimX | Contraste con hoy |
|---|---|---|
| **Speed / RPM / Gear / Pedals** | Funcionan sin cambios | Igual que hoy |
| **Standings** | Recibe `StandingRow[]` ya ordenado por Go, con `gap`/`int` resueltos; `clsPos` ausente y la columna de clase **no aparece** en `availableColumns` | Hoy TypeScript ordena por `place` con `?? 99`; si el adapter no escribiera esa clave, el widget caería al fallback `index + 1` y **mostraría un orden falso sin avisar** |
| **Relative** | `mode = "official-gap"` (SimX da gaps al líder); filas seleccionadas y ordenadas en Go | Hoy la selección ahead/behind y el orden viven en `relative-row-selection.ts` sin test de paridad |
| **Delta — fallback** | `DeltaNative = Unsupported` → el builder cae a la derivación propia, que solo necesita `lap_number` + `lap_distance` + `source_time` + `in_pit`. Durante el warm-up: `selected = "unavailable"`, `text = "—"`. Tras dos vueltas válidas: `available = ["previous-lap","personal-best"]`; si el usuario pidió `session-best` y no está, el frame declara `requested="session-best"`, `selected="personal-best"`, `fallback=true`, `authority="derived"` | Hoy el usuario con `personal-best` configurado **no vería nada**, porque `PersonalBest` solo se rellena desde el nativo, y el fallback del widget depende de `deltaReferenceSet`, un booleano sintético inventado en el adapter para negociar versión de protocolo |
| **Delta-trace / Delta-advanced** | Consumen la `deltaHistory` de Go, con `authority` visible; pueden atenuar visualmente un valor derivado | Hoy la historia de Go se transporta y se **sobrescribe** en el frontend |
| **Spotter / Radar — fallback** | `SpatialLateral = Unsupported` → se **desactivan** las familias que requieren lateralidad ("left", "right", "three-wide") con `ReasonCapabilityUnavailable`, y se **conservan** las longitudinales ("coche 0,3 s detrás") y las que vienen de facts (pit, bandera, vuelta). El widget se declara parcialmente disponible; el Studio lo indica | Hoy el manifiesto de Engineer está hardcodeado a `Supported` para las 7 capabilities, así que **el Spotter intentaría emitir avisos posicionales con posiciones ausentes** |
| **Track weather** | `Weather = Unsupported` estable: el Studio lo marca al añadir el widget, no en directo | Hoy funciona "por accidente" porque el weather no está mapeado ni para LMU, y el widget está además tras un gate comercial |
| **Fuel / strategy** | Funciona; el consumo por vuelta y las vueltas restantes se derivan en Go | Hoy `fuelHistory` es la única derivación que vive **solo** en TypeScript |
| **Car damage** | `Unknown` → widget oculto, sin error | Hoy pinta placeholders permanentes |

**Objetivo cumplido**: cero cambios en widgets existentes. La única condición bajo la que SimX obligaría a tocar el canonical es que aportase un **concepto común nuevo** (por ejemplo, energía virtual con semántica equivalente a la de otro sim); esa extensión se trata como cambio de dominio con su golden, no como alias en el frontend.

---

## 12.6 Plan de migración incremental (estructura de fases)

El detalle operativo irá en `12-migration-plan.md`. Aquí queda la estructura, las dependencias y los criterios.

| ID | Fase | Contenido | Depende de | Reversible | Gate de salida |
|---|---|---|---|---|---|
| **F0** | Red de seguridad | Test de 104 vehículos extremo a extremo (proyección + Hub); tests de slot gap/reuse, consumidor lento, reconnect y transición P→Q→R con firma stale; métricas de latencia de Engineer, edad del último frame y fallos de publicación | — | Sí | Los tests **fallan** reproduciendo D-01, D-08 y el escenario 21 |
| **F1** | Fallo no terminal | `failStop` reservado a errores de programación; publicación fuera del commit; error de payload/secuencia → descartar frame + contador + status `degraded`; publicar `error` **antes** de cerrar hubs; `recover()` por frontera de consumidor | F0 | Sí | Con 104 coches el runtime **degrada** en vez de morir; F0 pasa a verde en D-02/D-08 |
| **F2** | Watchdog y stale honesto | Edad recalculada en el store con reloj local; watchdog de "sin frames desde hace X" en backend y frontend | F1 | Sí | Un backend congelado deja de aparecer `fresh` en menos de 1 s |
| **F3** | Transacción única | `TelemetryEngine.Apply` con prepare/commit; el mapper no avanza cursor hasta el commit; coordinator dentro de la transacción; identidad con ventana de gracia; "cambio de player" desacoplado de epoch | F0 | Sí | F0 pasa a verde en D-01 y D-03; la paridad de replay por digest en dos pacings sigue verde |
| **F4** | Borrado de lo desconectado | `core.Fanout` (tras portar `FactResyncRequiredError`), RFC 7396 (Go y TS), seal, escáner de claves, `NewAnalysisFull`, `telemetry-store.ts` muerto. Guard de wiring que falle si un símbolo exportado solo aparece en tests | F1 | Sí (revert) | `go build ./...` y la suite completa verdes; el guard de wiring en verde |
| **F5** | Contrato generado | Generar `frontend/src/generated/telemetry.ts` desde los tipos wire Go; gate de CI que regenera y exige diff limpio; cabecera `DO NOT EDIT` | F4 | Sí | El espejo manual de 28 campos desaparece; el gate falla si alguien edita el generado |
| **F6** | Vertical slice | Un builder Go (`ControlsVM`: speed/rpm/gear + status) + `OverlayFrame v2` compacto + un widget migrado, **en shadow** contra la ruta legacy usando el comparador existente | F3, F5 | Sí, por widget | Paridad byte a byte del valor mostrado durante N sesiones; medición en **WebView2 y OBS**, no solo en Node |
| **F7** | Aislamiento de consumidores | Engineer asíncrono latest-wins + facts ordenados con cursor y resync; Strategy fuera del transporte público; Recording con cola acotada y gap markers (aún sin conectar) | F1, F3 | Sí | El escenario 21 deja de bloquear el bucle del driver; métrica de latencia de Engineer publicada |
| **F8** | Migración por feature | `StandingsVM`, `RelativeVM`, `DeltaVM`, `FuelVM`, `SessionVM`, `SpotterVM`; cada uno con shadow y paridad antes de conmutar | F6 | Sí, por builder | Cada widget pasa su gate de paridad antes de que se retire su rama legacy |
| **F9** | Retirada del legacy | `overlay-projection-adapter.ts`, `telemetry-snapshot.ts`, `scoring-readers.ts`, histories duplicadas y el comparador shadow | **Todos** los widgets productivos y OBS con paridad en F8 | No trivial | Cero importadores de `TelemetrySnapshot`; test de retirada por nombre, como el que ya existe para los transportes legacy |
| **F10** | Capabilities y multi-sim | `Supported`/`Available`/`Modes` cableados de extremo a extremo; manifiesto de Engineer derivado del driver activo; composition root genérico (`ObservationMapper`, `DriverManager` multi-candidato, `SourceStatus` desde el descriptor) | F8 | Sí | Un driver sintético "SimX" arranca sin tocar widgets (prueba de 12.5) |
| **F11** | Cadencias y regulación | Regular por sección **antes** de proyectar y serializar; dirty-trigger con tope para standings/sesión | F6 | Sí | Bytes/s medidos en el binario real, no en prototipo |
| **F12** | Puertos futuros | Conectar Recording con política de gaps; Analysis post-sesión sobre DuckDB desde SQLite e importación de los ficheros nativos de LMU; Strategy cuando exista Planner | F7, F9 | Sí | Cada puerto se conecta **con** su consumidor, nunca antes |

**Compatibilidad.** F0–F5 no cambian el contrato de red y pueden convivir con el frontend actual sin ninguna migración. F6–F8 mantienen las dos rutas en paralelo con shadow. Solo F9 es un punto sin retorno barato, y llega cuando todos los gates de paridad están en verde.

**Rollback.** F0–F7 y F10–F12 son revertibles por `git revert` de una fase completa. F8 es revertible por builder. F9 exige que la rama legacy siga en git y que exista una versión anterior publicable durante al menos un ciclo de nightly.

**Criterios de éxito globales.** (1) Ningún escenario de 09 §6 con riesgo A o M. (2) `OverlayFrame v2` por debajo de 64 KiB con 104 coches. (3) parse+decode en el frontend por debajo de 1 ms p99 con 104 coches, medido en WebView2. (4) Cero lógica de dominio bajo `widget-types/**`, verificado por test. (5) Cero símbolos exportados de `internal/telemetry` referenciados solo desde tests. (6) La prueba de 12.5 pasa con un driver sintético.

**Cuándo borrar el legacy.** Solo en F9, y solo cuando cada widget productivo **y** la ruta de OBS hayan pasado su gate de paridad en F8. Nunca por adelantado "para simplificar".

---

## 12.7 Riesgo de no actuar

Los siguientes no son riesgos hipotéticos: son defectos localizados en código, con su `archivo:línea`, y en su mayoría **sin ningún test que los cubra**.

| Defecto | Consecuencia si no se actúa |
|---|---|
| **D-01 — cursores divergentes** (`reducer.go:137` commitea antes que `batch_mapper.go:146-149`) | Un solo fallo de `coord.Apply` o `derive.Apply` deja al reducer adelantado y al mapper atrás; el frame siguiente produce `ErrStaleBatch`, que no es reintentable ni absorbible, y `DriverManager` llama a `setTerminal`. **Telemetría muerta hasta reiniciar la aplicación**, con una sola línea de log como rastro. Disparadores reales: `ErrVehicleHistoryOverflow`, `ErrFactBatchOverflow` (>256 facts en un batch: un salto de vueltas por teleport basta), `ErrFactSequenceExhausted`, o simplemente `ctx.Err()` entre dos stages |
| **D-08 — 256 KiB con parrilla grande** (`transport.go:44`) | Rechazo **medido** a partir de 103 coches en Overlay y 85 en Engineer. El sistema declara soportar 104. En una entrada de Le Mans con 62 coches el margen es de ~1,4×; una lista de espectadores o un servidor público lo agotan. Y el rechazo no degrada: mata |
| **D-02 — `failStop` irreversible** (`:846-865`, `:296-299`) | Causas transitorias (payload, hueco de secuencia, revisión de status, `json.Marshal`) producen `lifecycle = terminal` sin ninguna ruta de reinicio. `Start` posterior devuelve `ErrClosed` |
| **D-04 — tope acumulativo de 104 identidades** (`session_coordinator.go:27-29`) | Nunca se desalojan entradas. Combinado con D-03, cada frame perdido de cualquier fila consume presupuesto. En un enduro largo o un servidor con entradas y salidas, superar 104 identidades distintas es **probable**, y al superarlo se dispara D-01 |
| **D-03 — un frame perdido crea identidad nueva** (`batch_mapper.go:186-212`) | Si es un rival: sus vueltas rebasan desde cero y consume presupuesto. Si es el player: epoch nuevo → `ControlsHistory` y la referencia de delta **se borran**. Un microcorte de 16 ms destruye el widget insignia |
| **D-06 — frescura congelada** (`quality.go:42-47`, sin watchdog en ninguna capa) | Si el pipeline se detiene, el último frame se queda en el Hub y en el store **diciendo `fresh` indefinidamente**, y el status `error` no llega porque `failStop` cierra los hubs antes de publicarlo. **Un widget puede mostrar datos de hace minutos como si fueran actuales**; el único síntoma es que el reloj no avanza |
| **Engineer síncrono** (`telemetry_core_runtime.go:673` → `engineer_service.go:660-662`) | Cada milisegundo que Engineer tarda es un milisegundo que el driver no lee memoria compartida. `ConsumeObservation` toma `s.mu`, compartido con el puente de Wails y los comandos del usuario: **una acción del usuario en la UI puede bloquear la ingesta de telemetría**. Sin timeout, sin cola, sin métrica, sin test |
| **D-07 — `statusRevision` contigua** (`transport.go:333`, `store.ts:91-108`) | El Hub coalesce el status con un booleano; el store exige `+1` exacto y lanza. Además, cuando la revisión del snapshot no coincide con la del status, **descarta el snapshot**. Resultado: widget congelado de forma permanente tras un flapping de reconexión |
| **D-05 — cambio de piloto indetectable** (`batch_mapper.go:299-333`) | `RunIdentity.Driver`/`.Team` nunca se rellenan, así que `FactDriverChanged` es código inalcanzable y Engineer nunca resetea su ciclo de vida en un cambio de piloto. **En enduro —el caso de uso central de Le Mans Ultimate— el Engineer puede ejecutar una orden dirigida al piloto anterior** |
| **`scoring: Record<string, unknown>`** (`telemetry-snapshot.ts:39`) | 101 lecturas por string con alias defensivos y 16 claves que el adapter nunca escribe; los mocks del Studio **sí** las traen, de modo que existe un camino de verificación completo que confirma un comportamiento falso. Un agente prueba en Studio, lo ve bien y en carrera sale vacío |
| **Sin `recover()` en ninguna frontera** **[VERIFICADO-H]** | Un panic en un consumidor se lleva el proceso entero, no solo la telemetría |
| **Amplificación acumulada** | 47 archivos y cinco nombres para el mismo escalar. Con el segundo simulador ese coste se duplica y `TelemetrySnapshot` acumula más alias, encareciendo la migración que hoy ya es cara |
| **Código muerto que parece vivo** | `core.Fanout` está documentado en `docs/telemetry-core/runtime-fanout.md` como el distribuidor del runtime, y el README de telemetría afirma que "todavía no existe wiring productivo global" cuando lleva existiendo desde TC-07C. Un agente que haga `grep fanout docs/` construirá sobre el camino muerto **y nada se lo impedirá** |

---

## 12.8 Riesgo de simplificar demasiado

Estas son las garantías que se perderían si se aplicara la simplificación fuerte sin matices. Todas están respaldadas por un incidente documentado o por un test existente.

1. **Presencia independiente del valor.** Sin `Field[T]` con `present`/`freshness`/`provenance`, vuelve la clase de bug que descartaba **todo delta negativo** por validarlo con `v >= 0`. El propio diff local muestra la lección internalizada: LMU no tiene flag de validez para `mDeltaBest`, así que un cero antes de la primera vuelta se declara **ausente** en vez de inventar un `0.000`.
2. **Distinción "el sim no lo soporta" vs "ahora falta".** Es lo único que hace posible un contrato multi-sim sin `if simulator ==`. Hoy solo existe en Engineer; eliminarla en vez de generalizarla sería ir hacia atrás.
3. **Generaciones de identidad de slot.** Sin ellas, el coche que entra en un slot hereda vueltas, pits y delta del que salió. **Todo simulador con parrilla por slots tiene este problema.** El remedio a D-03 es una ventana de gracia, no eliminar el mecanismo.
4. **High-water de vueltas y presencia continua.** `session_coordinator.go:322-325` impide que una regresión de la fuente revoque un fact ya emitido, y `:309,346-358` impide un pit-in falso cuando un coche reaparece. Es lógica sutil, correcta y ganada con dolor.
5. **Frontera de producto de Engineer.** `boundary.go` cancela decisiones pendientes ante un cambio de piloto **dentro del mismo epoch**, sin que el Overlay parpadee. Un frame único obliga a elegir entre tirar la historia del Overlay sin motivo o ejecutar una orden dirigida al piloto anterior.
6. **Proyección como reducción.** 18.000 muestras privadas de interpolación → 120 públicas. Sin una capa de proyección, se envían 18.000 muestras por frame o se pierde la vuelta de referencia.
7. **Versionado independiente canonical/projection.** Permite evolucionar el núcleo sin romper un overlay ya desplegado en OBS del usuario, y viceversa. Con un contrato único, toda evolución es *breaking*.
8. **Paridad de replay determinista.** `canonical_integration_test.go:42-70` compara digests SHA-256 por los cuatro productos en dos modos de pacing. Depende de que ninguna capa del núcleo lea el reloj del sistema. Un diseño asíncrono mal hecho la pierde.
9. **`architecture_test.go`.** Reglas de frontera ejecutables que fallan con `archivo:línea`. Para un equipo de agentes vale más que cualquier `CLAUDE.md`. Una reescritura del núcleo abre una ventana en la que el repositorio se queda **sin su mejor guardarraíl**; la migración incremental de C no la abre.
10. **Absorción tipada de frames no mapeables.** `IsUnmappableFrame` distingue "este frame no describe una sesión mapeable" (menú, garaje, carga) de "el mapper está mal construido". Sin ella, **un único frame de garaje apagaba la telemetría hasta reiniciar**. Ese conocimiento debe migrarse literalmente.
11. **Catálogo append-only.** Es la única fuente declarativa del sistema y ya sabe generar. Borrarlo cierra la puerta a la generación de contratos, que es la medida de mayor relación valor/coste identificada por tres agentes independientes.
12. **Diseño asíncrono de Recording.** Cola acotada, `TryAccept` no bloqueante, estados `Idle/Recording/Stopping/Complete/Incomplete` y clasificación de fallo. Es el único patrón correcto de este tipo en el repositorio: es lo que hay que copiar, no lo que hay que borrar.

**Principio rector**: la reducción debe hacerse en **wiring y duplicación**, no en **semántica observable**. Un Engine monolítico con un `map[string]any` tendría menos archivos y más estados imposibles.

---

## Respuestas directas finales

**¿La arquitectura actual está correctamente dimensionada?**
**No, y falla en las dos direcciones a la vez.** Está **sobredimensionada** en transporte y productos dormidos: dos fanouts, RFC 7396 nunca ejercida, seal privado que nadie verifica, escáner de claves en el hot path, cuatro contratos de producto para dos consumidores arrancados, `statusRevision` contigua sobre un canal que coalesce, recording completo y desconectado, Analysis muerta. Y está **subdimensionada** exactamente donde el producto falla: sin frontera transaccional (cinco cursores), sin aislamiento de consumidores (un payload grande mata el runtime de forma terminal), sin watchdog (la frescura se congela y el status de error no llega), sin capabilities declaradas y sin contrato tipado hasta el widget. La prueba más clara de mal dimensionamiento es que **el sistema declara soportar 104 vehículos y su propio transporte los rechaza a partir de 103** **[MEDIDO]**.

**¿La simplificación propuesta mantiene el soporte multi-simulador?**
**Parcialmente, y menos de lo que promete.** Conserva lo esencial —`SourceFrame` tipado, capabilities declaradas por driver, calidad por campo bajo otro nombre— y eso basta para no perder el objetivo. Pero (a) su promesa de "cero archivos existentes modificados" para un simulador nuevo es falsa mientras el composition root declare `DriverManager[lmu.Observation]` y `*lmu.BatchMapper` **[VERIFICADO-H]**; (b) un `OverlayFrame` único tiende al superset por acumulación, que es el modo de fallo del multi-sim; (c) borrar el catálogo elimina la única fuente declarativa desde la que se puede garantizar coherencia entre simuladores; y (d) capabilities "por sim" sin capabilities "por sesión" no distingue "iRacing nunca da XYZ de rivales" de "el canal UDP de ACC lleva 3 s caído".

**¿Existe una opción superior a las dos planteadas?**
**Sí: la híbrida (C), 88/100**, por delante de la simplificación fuerte (79) y muy por delante de mantener la actual (60). Y existe una cuarta, la Opción D de G (85), que es **la misma dirección con más inversión adelantada**: catálogo generador, registry y tiers. C incorpora sus fases de menor riesgo (borrado de lo muerto, generación del contrato TS, exhaustividad de la matriz de autoridad) y pospone el resto con **condiciones de reevaluación falsables**: si tras completar C un campo del canonical sigue exigiendo edición coordinada en más de diez sitios, o si se confirma un tercer simulador a doce meses, o si un prototipo de tiers mide una mejora material frente al frame compacto, entonces D deja de ser anticipación y pasa a ser respuesta a evidencia.

**¿Qué debemos hacer ahora, exactamente?** *(sin implementar nada todavía)*

1. **Escribir los tests que hoy no existen y que deben fallar** (F0): 104 vehículos extremo a extremo hasta el Hub; fallo de un stage post-reducer para reproducir D-01; slot gap y slot reuse; consumidor lento; transición P→Q→R con la firma stale; Engineer lento. Sin esta red, cualquier cambio posterior es a ciegas.
2. **Convertir el fallo de publicación en no terminal** (F1): reservar `failStop` a errores de programación; descartar frame + contador + status `degraded`; publicar `error` **antes** de cerrar hubs; añadir `recover()` por frontera de consumidor. Es el cambio con mejor relación riesgo evitado / coste de todo el informe.
3. **Añadir watchdog de edad** (F2) en el store del frontend y en el runtime, para que un backend congelado deje de aparecer `fresh`.
4. **Unificar la transacción** (F3): `TelemetryEngine.Apply` con prepare/commit, mapper que no avanza cursor hasta el commit, y ventana de gracia en la identidad de slot.
5. **Borrar lo desconectado tras portar lo que sirve** (F4): `core.Fanout` (rescatando `FactResyncRequiredError` y la retención acotada de facts), RFC 7396 en Go y TS, seal, `NewAnalysisFull`; y añadir el **guard de wiring** que falle si un símbolo exportado de `internal/telemetry` solo aparece en tests, para que este problema no se reproduzca.

Y, en paralelo y sin bloquear lo anterior: **medir en WebView2 y en OBS** lo que hasta ahora solo se ha medido en Node y en `testing.B`. Ninguna promesa de rendimiento del vertical slice debe hacerse antes de esa medición.

---

## Cuestiones todavía no demostradas / incertidumbres

1. **Coste real de la migración del frontend.** Nadie ha migrado un solo widget. Todas las notas de "coste de migración" de los cuatro documentos son estimaciones. La única evidencia indirecta es que una migración anterior dejó un comparador de 1.132 líneas como cicatriz. **El vertical slice de F6 es la medición que falta.**
2. **Rendimiento en el entorno real.** No se han medido Wails `ExecJS`, WebView2, SSE real, React commit/layout/paint ni OBS. Las comparaciones **entre formas de payload** son válidas; los valores absolutos no predicen FPS.
3. **Discrepancia 128 µs vs 8,07 ms** entre la suma de microbenchmarks y el benchmark combinado del wiring. Exige un perfil antes de dimensionar CPU. No cambia la decisión, pero impide prometer un porcentaje de CPU.
4. **Tiers de cadencia sin medir.** La reducción del ~98 % es aritmética explícitamente marcada como inferencia por su autor. Lo medido es la compactación (−86,9 % bytes, −69 % latencia de proyección).
5. **Forma exacta de `SourceFrame` multi-fuente.** Se apoya en documentación comunitaria de iRacing, ACC y AC EVO, **no verificada contra los simuladores en ejecución**. Debe confirmarse antes de implementar el segundo driver.
6. **Riesgo de la generación de código con agentes.** El modo de fallo "el agente edita el artefacto generado" está mitigado (cabecera `DO NOT EDIT` + gate de CI que regenera y compara) pero **no resuelto**. Merece una decisión explícita antes de F5.
7. **Qué revela realmente el segundo simulador.** La regla de promoción ("dos sims con semántica equivalente") es razonable pero no está probada. Es posible que iRacing o ACC aporten un concepto que no quepa en `CanonicalState`; ampliar el tipo canónico entonces es irreducible en cualquier arquitectura con vocabulario común, y sigue siendo preferible a un `map[string]any`.
8. **Sesión larga y estabilidad de heap.** `alloc total` sobre 3.200 frames mide churn, no fuga. No se ha ejercitado una sesión de horas.
9. **Clasificación esencial/ceremonia (69 %)** es un juicio de agente, no una medida objetiva. El hecho subyacente —**cinco nombres para el mismo escalar y ningún test que los relacione**— sí es verificable y es lo que sostiene la conclusión.
10. **Tamaño de los productos futuros.** Los payloads constantes de Strategy (1.356 B) y Analysis (847 B) reflejan contratos mínimos actuales, no productos completos, y no deben usarse para dimensionar su transporte futuro.
