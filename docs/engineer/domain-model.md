# Modelo de Dominio — Vantare Ingeniero Go

> Nombres canónicos para el proyecto. Cualquier PR que introduzca un
> sinónimo debe actualizar este doc primero.

## Producto

**Vantare Ingeniero Go:**

Implementación Go/Wails del spotter de simracing y futuro ingeniero de
carrera. Reescritura del producto Python `Vantare-Ingeniero` (v0.7.0).

**Prealpha:**

Milestone actual centrado en un spotter LMU confiable con paridad
CrewChief.

**LMU:**

Le Mans Ultimate. Primer simulador soportado. Único sim soportado hasta
alpha 3.

**CrewChief:**

Producto de referencia y modelo de comportamiento para paridad del spotter
y suite del ingeniero.

## Conceptos Core

**Telemetry:**

Datos raw o normalizados del simulador: pose del player, pose de
oponentes, lap distance, velocidad y estado de sesión.

**Player:**

El coche del usuario.

**Opponent:**

Cualquier otro coche considerado por el spotter o la suite.

**Spotter:**

Lógica determinista de seguridad que anuncia coches cercanos: left,
right, both sides, clear, still there, three wide.

**Geometry:**

Matemática pura usada para clasificar la posición del oponente relativa
al player. Función pura, sin estado, sin I/O.

**Aligned X/Z:**

Posición del oponente rotada al frame local del player usando coordenadas
LMU/rFactor estilo CrewChief.

```
alignedX > 0 => left
alignedX < 0 => right
alignedZ < 0 => ahead
alignedZ > 0 => behind
```

**Side:**

Clasificación lateral del spotter: `none`, `left`, `right`, `both`.

**ActiveSides:**

Vista lateral del estado del spotter antes de procesar un frame.
Permite histéresis de overlap existente.

```
type ActiveSides struct {
    Left  bool
    Right bool
}
```

**Zone:**

Resultado de clasificar un oponente: side + vehicle ID + métricas
laterales/forward.

```
type Zone struct {
    Side      Side
    VehicleID int32
    LateralM  float64
    ForwardM  float64
}
```

**Engineer:**

Suite determinista que evalúa telemetría a 20 Hz y emite mensajes de
ingeniero: flags, penalties, damage, fuel, laps, session end, push now,
pit stops.

**Event (engineer):**

Mensaje emitido por un módulo de la suite: `EventID`, `Text`, `Priority`,
`Channel`, `TTLMS`.

```
type Event struct {
    EventID  string
    Text     string
    Priority Priority
    Channel  Channel
    TTLMS    int64
}
```

**Replay:**

Datos JSONL capturados o sintetizados para reproducir telemetría y
comportamiento del spotter/engineer offline.

**Fixture:**

Archivo pequeño de test en `internal/*/testdata/` usado por tests
automatizados.

**Audio queue:**

Cola con prioridad, FIFO, expiración y validación de validez por
metadata.

**Stale message:**

Mensaje en cola que era cierto al crearse pero es falso al momento de
reproducción. Ejemplo: `clear_right` después de que reaparece un coche a
la derecha.

**ValidityRule:**

Metadata en `audio.Message` que indica qué condición debe cumplirse al
reproducir el mensaje. Una regla `ValiditySpotterNoLeft` requiere que el
lado izquierdo **no** esté ocupado en el momento de reproducción.

```
type ValidityRule string

const (
    ValidityAlways          ValidityRule = ""
    ValiditySpotterLeft     ValidityRule = "spotter:left"
    ValiditySpotterRight    ValidityRule = "spotter:right"
    ValiditySpotterNoLeft   ValidityRule = "spotter:no_left"
    ValiditySpotterNoRight  ValidityRule = "spotter:no_right"
    ValiditySpotterAllClear ValidityRule = "spotter:all_clear"
    ValiditySpotterBoth     ValidityRule = "spotter:both"
)
```

**PTT:**

Push-to-talk. El piloto activa el reconocimiento de voz para hacer una
consulta o ejecutar un comando. Las respuestas son deterministas
(`facts`-only) o pasan por LLM solo para redactar.

**Defaults Locked:**

Conjunto de constantes verificadas en pista que no se debaten en cada
cambio. Publicadas en
[`vantare-go-master-plan.md`](vantare-go-master-plan.md) § "Defaults
Locked".

## Reglas de Nombres

- Usa `spotter`, no `ai spotter`, para lógica determinista
  izquierda/derecha.
- Usa `opponent`, no `enemy`.
- Usa `player`, no `ego`, salvo en un algoritmo local pequeño.
- Usa `replay fixture` para datos JSONL de test.
- Usa `CrewChief parity` para comportamiento copiado o validado contra
  CrewChief.
- Usa `engineer`, no `race engineer`, salvo para evitar colisión con
  contextos donde la palabra signifique otra cosa.
- Usa `PTT`, no `voice command`, cuando el contexto implique activación
  manual del piloto.
- Usa `LMU` o `Le Mans Ultimate` en singular; nunca "LMUs".
- Usa `TelemetryFrame` o `Frame` con prefijo de paquete para evitar
  colisión con `telemetry.Frame` genérico.

## Anti-términos

Estos nombres están **prohibidos** porque inducen a error o son
residuales de iteraciones previas:

- `ai spotter` — el spotter es determinista.
- `enemy` — los rivales no son enemigos; usa `opponent`.
- `ego` — fuera del algoritmo local; usa `player`.
- `wrapper` o `shell` sobre CrewChief — Vantare es producto
  independiente.
- `comentario` o `commentary` para mensajes deterministas — el lote
  está deshabilitado por defecto.
- `0.5 Hz` o `batch` para mensajes deterministas — suite evalúa a
  20 Hz.
- `LLM decide` — la IA redacta sobre facts, nunca decide.
