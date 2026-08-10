# Contratos concretos — Suite de análisis de telemetría

Estado: draft para revisión (Isaac + Sol). Deriva de ADR-0090 y ADR-0091 (legacy).
Estos contratos son la referencia de implementación de la vertical slice; se congelan cuando la slice los valide.

## 1. Esquema canónico (Go, `pkg/analysis/model`)

```go
type SessionID string   // ULID
type ChannelKey string  // nombre canónico, ej. "speed", "throttle", "brake", "tyre.pressure"

type Session struct {
    ID            SessionID
    SchemaVersion int             // versión del esquema canónico
    Simulator     string          // "lmu"
    SourceHash    string          // sha256 del raw (.duckdb + .wal) gestionado por Vantare
    RawPath       string          // copia gestionada, inmutable
    Track         string
    TrackLayout   string
    Car           string
    CarClass      string
    SessionType   string          // "P" | "Q" | "R"
    RecordedAt    time.Time
    Weather       string
    SetupJSON     json.RawMessage // setup completo del coche (metadata LMU)
    ImportState   string          // "done" | "quarantined" | "garage"
    AdapterVersion string
}

type Validity string // "unknown" | "valid" | "invalid"

type Lap struct {
    SessionID SessionID
    Number    int
    StartUs   int64 // tiempo de sesión, µs
    EndUs     int64
    LapTimeUs int64 // 0 = desconocido
    SectorUs  [3]int64
    Validity  Validity
    InLap     bool
    OutLap    bool
}

// Eje temporal canónico: int64 µs de tiempo de sesión (ADR-0090 §2).
// Periodo RACIONAL para evitar deriva acumulada (60 Hz = 50000/3 µs, no cabe en int64 µs):
//   t_i = T0Us + (i * PeriodNumUs) / PeriodDen   (aritmética entera, sin acumulación)
// Serie regular: t0 + periodo + valores; los gaps se modelan como segmentos separados.
type RegularSegment struct {
    T0Us        int64
    PeriodNumUs int64 // numerador del periodo en µs
    PeriodDen   int64 // denominador (100 Hz → 10000/1; 60 Hz → 50000/3)
    Values      []float32
}

type IrregularSeries struct {
    TimesUs []int64
    Values  []float32
}

type Shape string  // "scalar" | "wheels4" (orden fijo FL, FR, RL, RR) | "vec2" | "vec3"
type Domain string // "continuous" | "integer" | "state" | "boolean"

type ChannelMeta struct {
    Key            ChannelKey
    Shape          Shape
    Domain         Domain
    UnitCanonical  string  // por familia: m/s, °C, kPa, rad, %, RPM… (ADR-0090 §2)
    UnitOriginal   string  // la del sim, con conversión registrada
    SignConvention string  // ej. "steer: + = derecha", "pathLateral: + = izquierda"
    RateHz         float64 // 0 = irregular
    Provenance     string  // "native" | "derived"
    Simulator      string
    AdapterVersion string
    SourceHash     string
    Derivation     *Derivation // nil si native
    Coverage       float32     // proporción de la sesión con datos [0..1]
}

type Derivation struct {
    Algorithm string            // ej. "savitzky-golay-d1"
    Params    map[string]any    // ventana, orden…
    Version   int
    DependsOn []ChannelKey
}
```

**Convenciones obligatorias:**

- **`%`**: rango canónico **0..100** (float32). Nunca 0..1.
- **`wheels4`**: 4 series de valores paralelas sobre la misma base temporal, orden fijo **FL, FR, RL, RR**; en el wire van entrelazadas con stride 4 (`[fl0, fr0, rl0, rr0, fl1, …]`).
- **Sistema de coordenadas** (`posX`/`posY`, `TrackShape`): plano local ENU en metros — `x` = este, `y` = norte, origen = ancla del circuito (el centro (60°,0°) del GPS sintético decodificado); `z` = altitud cuando exista fuente.
- **Calidad/gaps**: la cobertura por canal (`Coverage`) se complementa con la lista de segmentos: un gap es la ausencia de segmento en un rango, nunca valores rellenados.
- **`TrackShape`**: polilínea muestreada por distancia `s` (paso ~1 m): `{ sM []float32, xM []float32, yM []float32, zM []float32|nil, widthM []float32|nil, widthConfidence []float32|nil, coverage float32, sourceLaps []LapRef }`. Ancho desconocido = `widthM nil` o confianza 0 en el tramo (ADR-0090).

**Canales canónicos de la vertical slice** (mapeo LMU → canónico):

| Canónico | LMU | Hz | Unidad canónica | Dominio |
|---|---|---|---|---|
| `speed` | Ground Speed | 100 | m/s (orig. km/h) | continuous |
| `throttle` | Throttle Pos | 50 | % | continuous |
| `brake` | Brake Pos | 50 | % | continuous |
| `steer` | Steering Pos | 100 | % (+ = derecha) | continuous |
| `gear` | Gear (evento) | irregular | - | state |
| `rpm` | Engine RPM | 100 | RPM | continuous |
| `lapDist` | Lap Dist | 10 | m | continuous |
| `posX`, `posY` | GPS lat/lon decodificado | 10 | m (plano local ENU) | continuous |

El **delta entre vueltas no es un canal**: depende de dos vueltas y se solicita como serie derivada (`DerivedSeriesRequest`, §2), computada sobre la vista por distancia.

## 2. DataAPI (TypeScript, consumida por ViewModels)

```ts
type Axis = 'time' | 'distance'
type Reduction =
  | { mode: 'full' }
  | { mode: 'm4'; buckets: number }   // continuos: 4 pares (x,y) por bucket — first/min/max/last CON sus posiciones x
  | { mode: 'transitions' }           // state/boolean/integer: todos los cambios + el estado vigente justo antes del rango

interface ChannelRequest {
  kind: 'channel'
  sessionId: string
  lap: number
  channel: string          // ChannelKey canónico
  axis: Axis               // 'distance' sirve la vista/cache por distancia (ADR-0090)
  range?: [number, number] // en unidades del eje; ausente = vuelta completa
  reduction: Reduction
}

// Series que dependen de MÁS de una vuelta (delta, y futuras: gap acumulado, diferencia de canal…)
interface DerivedSeriesRequest {
  kind: 'derived'
  derived: 'delta'         // catálogo abierto, versionado en servidor
  reference: LapRef        // { sessionId, lap }
  comparison: LapRef
  axis: 'distance'         // el delta solo tiene sentido por distancia
  range?: [number, number]
  reduction: Reduction
}

type SeriesRequest = ChannelRequest | DerivedSeriesRequest

interface SeriesData {
  meta: ChannelMeta | DerivedMeta
  revision: number          // cambia si el canal/derivado se re-computa
  axisValues: Float64Array  // m4: 4 valores x por bucket (paralelo a values)
  values: Float32Array      // m4: 4 valores y por bucket; transitions: primer elemento = estado previo al rango
}

interface DataApi {
  getSessions(q?: SessionQuery): Promise<SessionSummary[]>
  getLaps(sessionId: string): Promise<Lap[]>
  getSeries(requests: SeriesRequest[], signal: AbortSignal): Promise<SeriesData[]>  // batch: 1 round-trip por frame de petición
  getTrackShape(sessionId: string): Promise<TrackShape>
  onDataRevision(cb: (sessionId: string, keys: string[]) => void): () => void
}
```

Obligaciones de la implementación (ADR-0091 §2):
- **Cancelación**: `AbortSignal` propagada hasta el fetch; `abortPending()` del ViewModel la usa.
- **Dedup**: peticiones idénticas en vuelo se coalescen en una sola.
- **Cache**: LRU por clave `(request, revision)`; invalidación vía `onDataRevision`.
- **Reducción en servidor**: el frontend nunca reduce; pide `buckets ≈ anchoPx` y recibe listo para pintar.

**Transporte**: HTTP local (`internal/server/`), respuesta binaria (ArrayBuffer little-endian: cabecera JSON length-prefixed + arrays tipados). Endpoints: `GET /api/analysis/sessions`, `/api/analysis/laps`, `POST /api/analysis/series` (batch), `GET /api/analysis/trackshape`.

- **`protocolVersion`** en la cabecera de cada respuesta; cliente y servidor rechazan versiones que no entienden (error explícito, nunca parseo a ciegas).
- **Autenticación**: token aleatorio por arranque (mismo patrón de nonce que ya usa `internal/server/` para overlays) exigido en todos los endpoints `/api/analysis/*` — el puerto local no queda abierto a cualquier proceso de la máquina.

## 3. Ciclo de vida de panel (TypeScript)

```ts
interface PanelViewModel {
  mount(host: HTMLElement): void   // adjunta canvases/DOM al host que le da el shell
  unmount(): void                  // separa del DOM sin perder estado (el VM sobrevive fuera del DOM)
  activate(): void          // visible: reanuda suscripciones y render
  deactivate(): void        // oculto (tab no activa): suspende render y peticiones; conserva estado
  resize(w: number, h: number): void  // throttled por el shell durante drag de splitters
  abortPending(): void      // cancela todo request en vuelo
  dispose(): void           // libera suscripciones, canvases, buffers. Tras dispose, el VM es inerte.
}

interface PanelDefinition<C = unknown> {
  panelType: string
  panelVersion: number
  displayName: string
  icon: string
  defaultConfig: C
  createViewModel(config: C, dataApi: DataApi, sync: SyncHandle): PanelViewModel
  Component: React.FC<{ vm: PanelViewModel }>  // shell fino; el VM pinta en canvas
  migrate(oldConfig: unknown, fromVersion: number): C
}
```

Invariantes:
- **El VM vive fuera del DOM**: dockview desmonta por defecto el DOM de paneles ocultos; el shell usa el modo de render `always` de dockview con suspensión explícita vía `deactivate()`, y el VM persiste aunque el shell lo `unmount()`ee. La decisión final `always` vs. VM-externo-con-remount se toma en el spike W6.
- `deactivate()` ⇒ cero frames de render y cero peticiones hasta `activate()`.
- `dispose()` es idempotente y obligatorio al cerrar el panel; el shell lo garantiza.
- El VM no importa React, dockview, Wails ni fetch: solo `dataApi` y `sync`.

## 4. Sincronización por facetas (TypeScript)

```ts
type Facet = 'selection' | 'cursor' | 'viewport'
type GroupID = string // "A", "B"… | null = desvinculado

// Los payloads de viewport y cursor son AUTODESCRIPTIVOS: llevan su eje y unidades.
// El eje NO es una faceta independiente: cambiar de eje es una actualización ATÓMICA
// del viewport (eje nuevo + rango nuevo en sus unidades), evitando estados mixtos y loops.

// PersistentContext (serializable, por grupo): ADR-0091 §3
interface Selection { referenceLap: LapRef; comparisons: LapRef[]; revision: number }
// LapRef = { sessionId, lap, seriesSlot }
interface Viewport {
  axis: Axis                 // el eje viaja DENTRO del viewport
  range: [number, number]    // en unidades del axis declarado (s | m)
  revision: number           // monótona; un receptor ignora revisiones <= a la suya (anti-loop)
  origin: string             // panelId emisor; un panel ignora sus propios ecos
}

// RuntimeInteractionState (efímero, NUNCA serializado):
interface CursorPos {
  axis: Axis
  pos: number | null         // unidades del axis; null = fuera
  origin: string
}

interface SyncHandle {
  bind(facet: Facet, group: GroupID | null): void

  // Facetas "lentas" (estado observable; React puede verlas)
  getSelection(): Selection
  onSelection(cb: (s: Selection) => void): () => void
  getViewport(): Viewport
  onViewport(cb: (v: Viewport) => void): () => void
  setSelection(s: Omit<Selection, 'revision'>): void   // el bus asigna revision
  setViewport(v: Omit<Viewport, 'revision'>): void     // cambio de eje = setViewport atómico

  // Cursor: bus imperativo, fuera de React (ADR-0091 §3)
  publishCursor(c: CursorPos): void
  onCursor(cb: (c: CursorPos) => void): () => void
}
```

- `seriesSlot` en `LapRef`: `"reference" | "comparison-1" | "comparison-2"…` — el tema resuelve slot→color (ADR-0091 §4).
- El bus debe poder transportarse **cross-window** (popout plan B): implementación local síncrona en fase slice, con la interfaz preparada para BroadcastChannel/puente Wails sin cambiar el contrato.
- Cambios de `selection`/`viewport` invalidan/relanzan peticiones vía el VM; el cursor jamás dispara peticiones.
