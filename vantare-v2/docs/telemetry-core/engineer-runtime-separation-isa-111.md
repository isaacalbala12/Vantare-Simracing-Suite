# ISA-111 / TC-08D — separación del runtime Engineer

Fecha: 2026-08-01. Estado: implementación aislada, sin cutover LMU, merge ni
promoción.

## Resultado

`EngineerService` ya no posee ni construye una fuente de telemetría. Su única
entrada productiva es `ObservationSnapshotV1` más los hechos ordenados de la
proyección Engineer. El servicio arranca honestamente como desconectado y solo
acepta el origen `telemetry-core`.

```text
Telemetry Core (ISA-112)
  -> ObservationSnapshotV1 / FactEnvelopeV1
     -> EngineerService
        -> projectioninput.Adapter (familia explícita)
           -> core.Runtime (una familia)
              -> cola / audio / SSE / Wails
```

ISA-111 no conecta todavía el productor canónico en la raíz de composición;
esa activación y la validación LMU pertenecen a ISA-112. Sí deja imposible que
el servicio arranque `simulator`, `replay`, el parser LMU legacy o
`telemetry/service` como fallback productivo.

## Familias activables

La entrada ejecuta únicamente las familias que ISA-110 aprobó mediante replay:

- Spotter de tráfico normal;
- fuel;
- contador genérico de sanciones;
- laps;
- timings;
- entrada/salida de pit.

Cada familia recibe un frame acotado propio. El runtime no ofrece un catch-all
canónico: una familia desconocida falla cerrada y los monitores parciales o
disabled no ven ningún frame. Los estados previos se conservan por familia y
se descartan ante un cambio de epoch, sesión, vehículo, equipo o piloto.

## Lifecycle y honestidad

- `Start`/`Stop` son el único lifecycle del servicio y solo gobiernan la cola;
- `ConsumeObservation` y `ConsumeFact` no crean goroutines ni hacen I/O;
- después de `Stop`, las entradas se ignoran;
- `connection.lost` y `session.ended` resetean runtime y mensajes pendientes;
- `connection.recovered` no declara conexión hasta recibir un snapshot usable;
- cursores de hechos cero, repetidos o regresivos se rechazan;
- `/api/engineer/health` devuelve no disponible antes del primer snapshot real;
- desactivar Engineer cancela su estado conectado sin arrancar otro loop.

## Harnesses preservados

El simulador, replay, parser LMU legacy y `OverlaysLiveAdapter` se conservan
para tests y herramientas explícitas. `ProcessHarnessFrame` exige inyección
directa; no existe selector de producto que lo active. Audio/TTS, comandos,
store, SSE, Pit Manager y las suites legacy conservan su comportamiento.

## Evidencia

- `go test ./internal/engineer/... -count=1`: PASS;
- `go test ./internal/telemetry/... -count=1`: PASS;
- `go test ./internal/server ./internal/engineer/service -count=1`: PASS;
- frontend Engineer 15/15 y suite completa 2.025: PASS tras restaurar el
  golden transport v1 eliminado accidentalmente en ISA-109;
- `go vet` focal de service/core/projectioninput: PASS;
- `pnpm --dir frontend build`: PASS, warning heredado de chunk grande;
- `go test ./... -p=1 -count=1`: PASS;
- `go test -race`: no ejecutable porque el entorno tiene `CGO_ENABLED=0`;
- `git diff --check`: PASS.

## Rollback y siguiente corte

Rollback: volver a ISA-110 `a9ae7dba664035157d24a746775345d439ef0f98`.

ISA-112 debe proyectar observaciones y hechos desde el único runtime LMU,
inyectarlos en `EngineerService`, validar estados reales y retirar el selector
shadow. No debe reactivar ninguna familia parcial ni abrir otro reader.
