# Derivaciones canónicas ordenadas (ISA-37 / TC-04C)

## Resultado

`internal/telemetry/derive.Pipeline` consume exclusivamente snapshots
inmutables aceptados por el reducer y publica un snapshot final que contiene
por separado el estado observado y el derivado. El mismo snapshot observado
puede alimentar también al `SessionCoordinator`; el harness contractual prueba
la composición reducer -> coordinator -> derive sin conectar producción.

La cadena es lineal, síncrona y fija en código. No hay DAG, resolución dinámica,
plugins, callbacks, goroutines, I/O, JSON, logging, transporte ni decisiones de
producto.

## Registro y orden

Cada derivación registrada declara:

- ID estable y versión de algoritmo;
- posición única y explícita;
- inputs y outputs;
- límites de historia;
- límites de reset.

El registro canónico de este corte contiene una sola derivación:

| Orden | ID | Versión | Inputs | Output | Historia | Reset |
|---|---|---:|---|---|---:|---|
| 1 | `controls.history` | 1 | throttle, brake y clutch observados del vehículo activo | historial de controles | 120 muestras | epoch, sesión, run y vehículo |

`Registry` devuelve copias defensivas. `ValidateDefinitions` rechaza ID+versión
duplicados, órdenes duplicados/no contiguos, outputs con más de un productor,
autoconsumo y dependencias hacia una salida posterior. El pipeline productivo
no recibe definiciones externas: el validador existe para el guard del registro
y no convierte la cadena en un sistema de plugins. Cada snapshot final incluye
también la lista ordenada `ID + versión` que produjo sus derivados, con
ownership independiente.

## Presencia, calidad e historia

Solo una muestra con los tres controles `fresh` entra en historia. Cero sigue
siendo un valor observado válido. Un input `missing`, `invalid` o `stale`:

- conserva esa calidad en el output de la derivación;
- no inventa un valor;
- no borra historia ya confirmada;
- no entra en la historia.

El límite canónico de 120 procede del historial frontend caracterizado en
`docs/telemetry-core/domain-inventory.md`. Un harness puede reducirlo, nunca
ampliarlo. Al llenarse, se descarta únicamente la muestra confirmada más
antigua; no existe una colección ilimitada.

Todo cambio de epoch resetea la historia. Esto cubre reset de fuente, cambio
real de sesión/evento y cambio de vehículo/run. Un cambio de piloto o equipo
dentro del mismo run no resetea historia, igual que en reducer y
`SessionCoordinator`.

## Gaps y delta

Gaps y delta permanecen explícitamente `missing` y no aparecen en el registro
de algoritmos.

No se migra el paquete legacy `gap`: el estado observado canónico todavía no
incluye distancia de vuelta, longitud de pista ni tiempos de referencia con
unidad, presencia y convención de signo demostradas. El inventario deja esas
preguntas abiertas.

No se migra el paquete legacy `delta`: el estado observado tampoco incluye
distancia recorrida, tiempo dentro de vuelta, clase ni una referencia canónica.
El fallback sintético legacy supone velocidad constante y no es evidencia
suficiente para convertirlo en algoritmo canónico.

Registrar una versión para cualquiera de esos cálculos antes de cerrar esos
inputs daría autoridad a una semántica no demostrada. Un corte futuro deberá
añadir characterization/golden de fuente real antes de cambiar `missing`.

## Orden, atomicidad y ownership

El pipeline valida cursores independientemente:

- primer snapshot: epoch distinto de cero y sequence 1;
- dentro del epoch: sequence exactamente consecutiva;
- nuevo epoch: incremento exacto y sequence 1;
- evento, sesión o vehículo no cambian dentro del mismo epoch.

Un error de orden o una cancelación conserva cursor, snapshot e historia
anteriores. El reintento del mismo cursor válido produce el mismo resultado.
El header observado se preserva exactamente. Entrada, estado interno, salida y
lecturas de `Current` poseen copias separadas de todos los slices.

## Verificación

```powershell
go test ./internal/telemetry/derive -count=20
go test ./internal/telemetry/... -count=1
go test -race ./internal/telemetry/derive -count=10
go test ./internal/telemetry/derive -run '^$' -fuzz '^FuzzPipelineAgainstHistoryOracle$' -fuzztime=10s
go test ./internal/telemetry/derive -run '^$' -bench '^BenchmarkPipelineApply64Vehicles$' -benchmem -count=5
go test ./internal/telemetry/... -run 'TestTelemetryProductionImportsFollowADR0004|TestValidateImport|TestScanProductionImportsIgnoresTestsGeneratedFilesAndTools' -count=1
go vet ./internal/telemetry/derive
```

La verificación manual consiste en ejecutar el test golden/replay y revisar que
la secuencia `fresh -> stale -> fresh` conserva solo las muestras fresh, limita
la historia y mantiene gaps/delta missing. No se conecta LMU real, no se altera
producción y no hay UI nueva que probar.

Rollback: revertir el commit de ISA-37. Al no existir wiring productivo,
persistencia ni formato externo, no requiere migración de datos o configuración.

Evidencia de este worktree:

- derive x20, Telemetry Core completo, guard ADR 0004, vet focal, suite global
  Go, race derive x10 con GCC UCRT64 y `git diff --check`: PASS;
- fuzz con oráculo 10 s: PASS, 37.673 ejecuciones;
- benchmark Windows/amd64, AMD Ryzen 7 3700X, 64 vehículos, cinco repeticiones:
  21,7–27,2 µs/op, 109.008–109.024 B/op y 9 allocs/op;
- el primer global encontró `frontend/dist` ausente; tras instalar dependencias
  desde el lockfile y generar el artefacto ignorado, frontend build y global
  PASS. Vite conserva el warning conocido de chunk grande;
- `go vet ./internal/telemetry/...` conserva solo tres warnings heredados
  `unsafe.Pointer` en lectores/versionado Win32 fuera del diff.

## Fuera de alcance

- Advice, Engineer, Strategy y decisiones de producto;
- proyecciones, Wails/SSE, fan-out o transporte;
- recording/replay productivo;
- driver LMU, composition root o hot callbacks;
- migración de gaps/delta sin evidencia;
- DAG, plugins o dependencias nuevas.
