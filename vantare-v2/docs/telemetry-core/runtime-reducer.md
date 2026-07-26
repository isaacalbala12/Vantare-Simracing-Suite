# Reducer canónico single-writer

Estado: implementación aislada de ISA-35 / TC-04A, pendiente de review y
validación manual de Isaac. No existe wiring productivo.

## Contrato

- `core.Batch` contiene un estado observado completo y un
  `envelope.Header` con epoch/sequence.
- El primer lote exige identidad completa de evento y sesión, un epoch distinto
  de cero y sequence 1. El epoch inicial puede ser cualquiera distinto de cero.
- Dentro del mismo epoch se acepta únicamente la siguiente sequence y
  `Event`/`Session` deben seguir representando la misma sesión según
  `RunIdentity.SameSession`. Un header parcial nunca desactiva esta validación.
  `Vehicle`, `Team` y `Driver` pueden cambiar sin rotar el epoch.
- Un reset válido incrementa el epoch exactamente en uno, vuelve a sequence 1
  y exige otra vez identidad completa. En ese límite sí puede cambiar
  `Event`/`Session`.
- Duplicados, retrocesos, gaps, saltos de epoch, conteos incoherentes e
  identidades de vehículo vacías, duplicadas o pertenecientes a otra sesión se
  rechazan antes de cambiar el estado.
- Cada lote reemplaza el estado completo en una sola operación. Un lote
  rechazado conserva exactamente el cursor y estado anteriores.
- `ObservedState` y `VehicleState` usan los tipos canónicos de `schema`. El
  catálogo no se importa en `core`: ADR 0004 exige que el catálogo permanezca
  fuera del contrato runtime y que sea el driver quien use sus IDs estables.

## Ownership y concurrencia

- El reducer copia el slice de vehículos al aceptar el lote.
- El productor conserva el ownership del lote durante la llamada síncrona y
  puede volver a mutarlo libremente después de que `Apply` retorne.
- Cada `envelope.Snapshot` vuelve a copiar sus colecciones al construirse y en
  cada lectura. Un productor o consumidor no puede mutar el estado publicado.
- `Run` es el único owner del loop mientras está activo, no crea goroutines y
  rechaza un segundo owner. El contexto se revalida inmediatamente después de
  recibir y antes de aplicar: si la cancelación gana ese límite, el lote puede
  haberse consumido del canal, pero no cambia cursor/estado ni se publica. El
  mismo lote puede reenviarse al reiniciar. También se cancela la publicación.
- El loop no contiene red, disco, JSON, reflection, logging, callbacks
  inyectables ni decisiones de producto.
- No se implementa structural sharing. El benchmark de 64 vehículos registra
  explícitamente el coste de copia completa antes de considerar optimizaciones.

## Límites del corte

No se conectan Driver LMU, DriverManager, Wails/SSE, Overlay, Engineer,
Strategy, recording, replay, fan-out o derivaciones. La traducción del lote
fusionado LMU al estado neutral y todo wiring pertenecen a cortes posteriores.

## Verificación

```powershell
go test ./internal/telemetry/core -count=1
go test -race ./internal/telemetry/core -count=1
go test ./internal/telemetry/core -run '^$' -fuzz FuzzReducerCursorValidation -fuzztime=10s
go test ./internal/telemetry/core -run '^$' -bench BenchmarkReducerApply64Vehicles -benchmem -count=5
go test ./internal/telemetry/... -count=1
```

Evidencia de este worktree:

- core repetido 20 veces, Telemetry Core completo, guard ADR 0004, vet focal y
  suite global Go: PASS; el vet amplio conserva únicamente seis warnings
  `unsafe.Pointer` Win32 heredados fuera del diff;
- fuzz con oracle/modelo 10 s: PASS, 2.508.370 ejecuciones; cada transición
  comprueba error, cursor, atomicidad y snapshot;
- benchmark Windows/amd64, AMD Ryzen 7 3700X, 64 vehículos, cinco repeticiones:
  8,77–9,61 µs/op, 36.264 B/op y 5 allocs/op;
- race focal: PASS con el GCC UCRT64 ya instalado, usando temporalmente
  `CGO_ENABLED=1`, `CC=gcc.exe` y su directorio en `PATH`; no se instaló ni
  modificó toolchain del sistema.

Rollback: revertir los commits de ISA-35. Al no existir wiring productivo, el
rollback no requiere migración de datos ni cambios de configuración.
