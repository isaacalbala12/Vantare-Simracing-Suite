# SessionCoordinator canónico (ISA-36 / TC-04B)

## Resultado

`internal/telemetry/core.SessionCoordinator` consume exclusivamente snapshots
inmutables ya aceptados por el reducer y emite hechos discretos por un puerto
neutral. No adquiere telemetría, no modifica snapshots, no conoce LMU ni
productos y no crea goroutines.

Snapshots y hechos conservan contratos distintos:

- el snapshot sigue siendo `latest-wins` y mantiene su cursor `epoch/sequence`;
- cada `SessionFact` tiene una secuencia monotónica propia;
- el sink recibe un lote ordenado y debe aceptarlo completo o devolver un
  error;
- un error, cancelación u overflow no avanza cursor, identidades, historial ni
  secuencia de hechos.

## Identidad y resets

El coordinator no inventa IDs desde nombres ni datos raw. Consume los IDs
canónicos de evento, sesión, vehículo, equipo y piloto ya resueltos aguas
arriba. Para el coche activo, equipo y piloto se toman de la identidad del
vehículo dentro del snapshot completo.

- Cambio de `SourceID`: conserva sesión e historial.
- Cambio del número/lista de participantes: no crea una sesión.
- Desconexión breve y recuperación: emite hechos, pero conserva sesión y epoch.
- `EndSession`: cierra explícita e idempotentemente una sesión cuando todavía no
  existe un snapshot sucesor; una pérdida de conexión nunca llama implícitamente
  a este límite.
- Cambio de equipo o piloto: emite `driver changed`; no reinicia sesión.
- Cambio de coche/run con la misma sesión: reinicia historial por vehículo, no
  emite `session ended/started`.
- Cambio real de evento o sesión: emite `session ended` y después
  `session started`, y reinicia el historial por vehículo.
- Un nuevo epoch con la misma identidad puede representar un reset de fuente y
  no reinicia por sí solo la sesión.

Las identidades son evidencia canónica de entrada. Este corte no añade
confidence sintética: si un driver futuro no puede demostrar un ID estable,
debe resolver presencia/calidad antes del reducer, no generar un hash o usar
nombres personales dentro del coordinator.

## Hechos y orden

El orden dentro de una actualización es estable:

1. lifecycle de sesión;
2. cambio de piloto/equipo;
3. vueltas completadas;
4. entrada o salida de pit.

La pérdida y recuperación de conexión se notifican explícitamente mediante
`SetConnected`. Estados repetidos son idempotentes.

`session ended` se emite antes de iniciar una identidad de sesión sucesora o
mediante `EndSession` si el runtime observa un final explícito sin sucesor.

`lap completed` usa el contador canónico de vueltas completadas. Un salto emite
una entrada por vuelta para no perder hechos. Un retroceso temporal dentro de
la misma sesión conserva el high-water mark; una nueva sesión o cambio de coche
crea un historial nuevo.

`pit entered/exited` necesita el estado booleano observado `VehicleState.InPit`.
`PitStopCount` no es suficiente para demostrar una salida, por lo que no se
infiere ese hecho desde el contador.

## Backpressure, ownership y límites

`FactBatchSink.WriteFacts` es un puerto all-or-none. El sink puede devolver
`ErrBackpressure`, `ErrClosed` o un error envuelto; el coordinator lo propaga
sin cambiar estado. El límite por defecto es 256 hechos por snapshot y se puede
reducir en harnesses. Superarlo devuelve `ErrFactBatchOverflow`.

No existe cola interna, drop, logging por muestra ni callback de producto.
Fan-out, métricas y políticas por consumidor pertenecen a ISA-38. El sink se
invoca fuera del mutex: puede leer el último estado confirmado, y un consumidor
lento no bloquea lectores de `Current`.

## Clock

`SessionCoordinatorConfig.Now` inyecta la hora UTC de ocurrencia. Los tests usan
un reloj manual y no usan `time.Sleep`. El cursor y la secuencia, no la hora de
pared, determinan el orden.

## Verificación

```powershell
go test ./internal/telemetry/core -run SessionCoordinator -count=20
go test ./internal/telemetry/... -count=1
go test ./internal/telemetry/core -run '^$' -fuzz '^FuzzSessionCoordinatorTransitions$' -fuzztime=10s
go test ./internal/telemetry/core -run '^$' -bench '^BenchmarkSessionCoordinatorApply64Vehicles$' -benchmem -count=5
```

La verificación manual en este corte consiste en inspeccionar los hechos de un
harness controlado: inicio de sesión; desconexión/recuperación; cambio de
fuente; cambio de piloto/equipo; salto de vuelta; entrada/salida de pit; cambio
de coche; cambio de sesión. No se conecta LMU real ni se cambia producción.

## Fuera de alcance

- advice Engineer/Strategy y decisiones de producto;
- proyecciones, Wails/SSE, fan-out y métricas;
- recording/replay;
- transporte o composition root;
- mock/replay productivo;
- generación de identidades desde raw o PII.
