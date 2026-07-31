# Runtime fan-out — snapshots, hechos y backpressure

Estado: ISA-38 / TC-04D, implementación aislada sin wiring productivo.

## Objetivo y frontera

`internal/telemetry/core.Fanout` distribuye el resultado completo del runtime
canónico sin introducir I/O, transporte, producto o goroutines propias.
Reducer, `SessionCoordinator` y derivaciones siguen siendo síncronos; el
fan-out recibe snapshots finales y hechos ya aceptados.

No es una proyección de Overlay, Engineer, Strategy o Analysis. Tampoco es
Wails, SSE, recording, replay, JSON, logging o una cola de trabajo.

## Dos contratos distintos

### Snapshot latest-wins

- Cada publicación contiene juntos `Snapshot`, `FanoutStatus`, `Revision` y el
  último `FactSequence` que el owner afirma que ese snapshot cubre
  causalmente. El cursor se pasa de forma explícita: no se captura del writer.
- La cobertura no puede retroceder ni superar el último hecho aceptado. Un
  hecho escrito después de calcular el snapshot sigue pendiente de replay,
  aunque se publique antes que ese snapshot.
- El primer `Next` devuelve el frame completo vigente cuando ya existe.
- Cada suscriptor usa un canal de capacidad uno. Si no ha leído el frame
  anterior, este se sustituye por el último completo.
- El publisher nunca espera al consumidor.
- La revisión del snapshot y la secuencia de hechos son cursores independientes.
  Ningún consumidor puede deducir uno a partir del otro.

El contrato es siempre snapshot completo. No existen diffs. Perder una revisión
no requiere reconstrucción incremental.

### Hechos ordenados

- Los hechos usan una secuencia propia, estrictamente contigua y distinta del
  cursor del snapshot que los originó.
- La retención compartida es un ring buffer acotado.
- `Next` entrega exactamente el siguiente hecho disponible.
- Si un lector queda por detrás del hecho más antiguo retenido, recibe
  `ErrFactResyncRequired` con el último hecho aceptado y el primero disponible.
- Después del error debe pedir `Latest`, adoptar el snapshot completo y abrir
  una nueva suscripción desde el `FactSequence` causalmente cubierto. Así
  reproduce cualquier hecho posterior y no lo omite silenciosamente.
- Un lote inválido, discontinuo o mayor que la retención se rechaza completo.
  Nunca se pierden hechos silenciosamente ni se confirma un lote parcial.

## Budgets

| Recurso | Default | Máximo |
|---|---:|---:|
| Hechos retenidos | 1.024 | 4.096 |
| Suscriptores de snapshot | 32 | 64 |
| Suscriptores de hechos | 32 | 64 |
| Buffer por suscriptor snapshot | 1 frame | 1 frame |
| Señal por suscriptor de hechos | 1 aviso | 1 aviso |

La implementación no crea una goroutine por suscriptor ni mantiene una cola
por lector de hechos. La memoria de hechos pertenece a un único ring
compartido. Los productos deben proyectar y transportar fuera de este paquete.

## Observabilidad

`FanoutMetrics` es una copia inmutable y de cardinalidad fija:

- snapshots publicados y entregas pendientes sustituidas por suscriptor;
- suscriptores y máximo lag **actual** entre suscriptores, que puede volver a
  cero cuando todos consumen el último frame;
- hechos publicados, profundidad/capacidad del ring y resyncs;
- transiciones a stale y reintentos de reconexión observados;
- muestras, total y máximo del coste de derivación informado por el caller.

No contiene valores de telemetría, IDs personales, rutas ni labels dinámicos.
El hot path no lee el reloj. El runtime mide las derivaciones y entrega su
duración a `PublishSnapshot`.

## Cierre

`Close` es idempotente, marca el fan-out como cerrado, despierta todos los
`Next` bloqueados y rechaza publicaciones posteriores con `ErrClosed`. Cerrar
simultáneamente el owner y cualquiera de suscripciones está protegido por un
único mutex/mapa de ownership; no existe un `sync.Once` compartido que pueda
invertir el orden de locks.

Las suscripciones no vinculan su vida al contexto usado al crearlas. Cada
operación `Next` recibe su propio contexto cancelable. `Close` conserva la
firma uniforme, pero la liberación in-memory no se omite aunque ese contexto ya
esté cancelado. Entregar `FactSequence` máximo agota explícitamente el cursor;
la siguiente lectura devuelve `ErrFactSequenceExhausted` y nunca vuelve a cero.

## Evidencia de rendimiento

Baseline repetido el 2026-07-28 en Windows/amd64, AMD Ryzen 7 3700X, con el
equipo bajo carga normal del entorno de desarrollo. Salida resumida de cinco
repeticiones en `evidence/isa-38-fanout-benchmark.md`:

| Benchmark | Resultado |
|---|---|
| Publish snapshot escalar | 231,1–251,6 ns/op, 0 B/op, 0 allocs/op |
| Write de un hecho | 129,1–136,2 ns/op, 0 B/op, 0 allocs/op |
| Snapshot completo de 64 vehículos | 3,753–5,432 µs/op, 16.384 B/op, 1 alloc/op |

El benchmark de 64 vehículos incluye la copia de ownership al construir el
`envelope.Snapshot`; el benchmark escalar aísla el coste del fan-out. La
asignación grande no la introduce el canal latest-wins. No se añade structural
sharing hasta que una medición end-to-end demuestre que es necesario.

El soak determinista publica 20.000 snapshots y hechos, conserva exactamente el
budget configurado, sustituye los snapshots intermedios y fuerza resync
explícito del lector lento. Otro test hace 500 publicaciones con lectores
concurrentes y demuestra hechos contiguos y llegada al último snapshot. El test
de teardown repite 1.000 cierres concurrentes de owner/suscripciones. Las
regresiones adicionales cubren interleaving causal snapshot/hechos, cierres con
contexto cancelado, métricas con dos suscriptores y agotamiento en `MaxUint64`.

## Verificación

```powershell
go test ./internal/telemetry/core ./internal/telemetry/derive -count=20
go test ./internal/telemetry/... -count=1

$env:CGO_ENABLED = "1"
$env:PATH = "C:\msys64\ucrt64\bin;$env:PATH"
go test -race ./internal/telemetry/core ./internal/telemetry/derive -count=1

go test ./internal/telemetry/core -run '^$' -bench 'BenchmarkFanout' -benchmem -count=5
git diff --check
```

## Siguiente frontera

ISA-39 define proyecciones versionadas por producto sobre puertos de lectura.
No debe adaptar este paquete a Wails/SSE ni introducir contratos de producto en
`core`. Recording/replay llega después y tiene política de backpressure
distinta: nunca puede descartar datos aceptados silenciosamente.
