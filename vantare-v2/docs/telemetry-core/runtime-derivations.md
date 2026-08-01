# Derivaciones canónicas ordenadas (ISA-129 / TC-07A.1 D6)

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

El registro canónico contiene cuatro derivaciones fijas:

| Orden | ID | Versión | Inputs | Output | Historia | Reset |
|---|---|---:|---|---|---:|---|
| 1 | `controls.history` | 1 | throttle, brake y clutch observados del vehículo activo | historial de controles | 120 muestras | epoch, sesión, run y vehículo |
| 2 | `session.remaining` | 1 | reloj actual y fin observado de sesión | segundos restantes | — | epoch y sesión |
| 3 | `standings.relative-gaps` | 1 | tiempo y vueltas detrás del líder de jugador y rivales | gap temporal o delta de vueltas por vehículo | — | epoch, sesión, run y vehículo |
| 4 | `session.self-delta` | 1 | reloj, vuelta, distancia e InPit observados del jugador | delta, referencia y tendencia | 18.000 muestras privadas; 120 públicas | epoch, sesión, run y vehículo |

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

## Remaining, gaps y delta

`session.remaining@1` calcula únicamente `end-current`. Ambos inputs deben ser
finitos, compatibles y estar ordenados. Cero sigue siendo un resultado válido;
una sesión limitada por vueltas conserva `MaximumLaps` y no recibe un tiempo
inventado.

`standings.relative-gaps@1` usa
`player.timeBehindLeader - vehicle.timeBehindLeader`. Positivo significa rival
por delante y negativo rival por detrás. Si existe diferencia de vueltas, solo
publica el delta de vueltas: nunca transforma una vuelta en segundos ficticios.
Player markers, procedencia observada, presencia, finitud y calidad deben ser
demostrables.

`session.self-delta@1` usa la mejor vuelta válida completada por el jugador como
referencia. Positivo significa que la vuelta actual es más lenta y negativo que
es más rápida. La referencia se interpola por distancia exclusivamente entre
muestras observadas; no extrapola, no consume `mDeltaBest` y no usa el fallback
legacy de velocidad constante.

La primera vuelta parcial solo sincroniza. Pit, dato missing/invalid, regresión
de vuelta, cambio de epoch/sesión/run/vehículo o una discontinuidad grande
invalidan la candidata. La evidencia LMU 1.4 demostró dos particularidades del
stream real:

- LMU puede repetir frames fresh con el mismo reloj; una repetición idéntica se
  ignora, mientras que datos distintos con el mismo reloj se rechazan;
- `Lap Dist` puede oscilar unos pocos metros y el contador de vuelta puede
  cambiar hasta `500 ms` antes o después del reset de distancia. El tracker
  conserva un high-water mark, ignora esas oscilaciones para construir la
  referencia y solo considera wrap una caída de al menos `100 m` confirmada por
  el cambio de vuelta dentro de esa ventana.

La traza sanitizada real contiene 1.846 muestras a 10 Hz, tres wraps y dos
vueltas comparables. Su SHA-256 es
`d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938`.
La primera vuelta midió `96,2 s`, la segunda `85,8 s`, y el test independiente
comprueba en cada muestra comparable no nula que el signo derivado coincide con
la diferencia temporal medida a la misma distancia interpolada. El golden fija
la incertidumbre de muestreo en `100 ms` y exige al menos una diferencia real y
derivada superior a ese umbral.

Dos vueltas solo son comparables si sus dominios de distancia tienen un tramo
real solapado. Una regresión de vuelta elimina referencia e historial antes de
cualquier ruta especial de timestamp o wrap pendiente. El capturador aplica el
mismo contrato, propaga fallos reales del driver aunque ya tenga dos vueltas y
elimina el destino si escritura, sincronización o cierre no terminan bien.

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

La verificación manual consiste en ejecutar el golden/replay y comprobar que la
traza real reproduce dos vueltas comparables, que los gaps conservan el signo
documentado y que remaining preserva cero. El corte no modifica UI ni conecta
todavía el pipeline a producción.

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
- proyección Overlay/TypeScript y wiring productivo, que pertenecen a D7;
- DAG, plugins o dependencias nuevas.
