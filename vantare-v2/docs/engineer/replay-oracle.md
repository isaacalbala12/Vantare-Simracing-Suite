# ISA-133 / ENG-04 — Runner y oráculo determinista de replays

> **SNAPSHOT / ISSUE EVIDENCE.** El estado inferior pertenece al corte aislado
> de ISA-133 y no describe Nightly. Consulta el [router Engineer](README.md) y
> el [handoff vivo](../vantare-program/handoffs/engineer-spotter.md); usa este
> archivo solo como evidencia del runner test-only, nunca como fuente runtime.

Estado: implementado en rama aislada sobre ISA-117 `170eaeb`. Sin wiring de
producto, audio, I/O de simulador, goroutines, merge ni promoción.

## Objetivo

`internal/engineer/replayoracle` es el laboratorio reproducible con el que los
siguientes cortes de Engineer comprobarán decisiones antes de llevarlas a una
carrera. Recibe únicamente `ObservationSnapshotV1` y `FactEnvelopeV1`, usa un
reloj virtual y devuelve un informe versionado con resultados observables.

No es una fuente de telemetría ni un segundo runtime. No abre Shared Memory,
REST, archivos, Wails o SSE; tampoco controla dispositivos de audio. Cada
ejecución crea estado nuevo y aislado.

## Contrato de entrada y ejecución

- `ScenarioVersionV1` fija el formato lógico del escenario.
- `OracleVersionV1` conserva la semántica histórica de decisión. ENG-06 añade
  `OracleVersionV2`, que distingue selección, entrega al transporte e inicio
  confirmado.
- `VirtualClock` solo avanza mediante deltas no negativos y no duerme.
- La suma del reloj es checked. El rango deja 60 segundos de headroom para el
  mayor deadline de los monitores legacy; start, avance o deadline que puedan
  desbordar fallan cerrados.
- `Seed` queda registrada en el informe. El corte actual no usa aleatoriedad.
- Los snapshots son latest-wins y mantienen epoch, identidad, capabilities,
  freshness, procedencia y versión de la proyección.
- Los hechos se consumen en orden estricto por epoch y secuencia.
- Un cambio válido de epoch, sesión, coche, equipo o piloto descarta estado y
  decisiones pendientes. `session.started` también es boundary incluso si no
  llega acompañado por un snapshot. Un retroceso o cambio de identidad
  inválido falla cerrado.
- Una capability `unknown`, `unsupported` o `degraded`, un campo missing,
  stale/invalid o una versión desconocida nunca se transforma en dato válido.
- Un snapshot con más de los 104 vehículos admitidos por el contrato canónico
  se rechaza antes de crear/copiar un frame de compatibilidad.

## Resultados observables

Cada resultado contiene secuencia, paso, instante virtual, familia, estado,
motivo y, si existe, ID/text key/deadline del mensaje.

| Estado | Significado |
|---|---|
| `emitted` | La decisión está dentro del escenario ya demostrado y llegó antes de su deadline. |
| `suppressed` | La familia era utilizable, pero sus reglas no generaron candidato. |
| `expired` | Existía un candidato aprobado, pero venció antes del drenado explícito. |
| `cancelled` | Una frontera de lifecycle/identidad invalidó una decisión pendiente. |
| `unavailable` | La entrada, familia o decisión no tiene evidencia suficiente para autorizarse. |
| `dispatched` | La decisión se entregó al puerto de transporte; todavía no demuestra inicio. |
| `playback_started` | El transporte confirmó el comienzo y la policy lo revalidó. |

El replay v2 modela también `connection.lost -> connection.recovered`. La
desconexión cancela todo pendiente y bloquea snapshots mientras la fuente está
caída. El hecho de recuperación no restaura decisiones ni prueba datos: el
playback solo puede reanudarse después de una observación canónica fresca.

Los motivos forman parte del contrato y distinguen, entre otros, stale,
versiones desconocidas, capability incompleta, familia no aprobada y
`decision_not_approved`.

## Matriz exacta heredada de TC-08C

| Estado | Familias | Límite del oráculo ENG-04 |
|---|---|---|
| Aprobado y acotado | Spotter | Left/right/three-wide/still-there/clear normales. |
| Aprobado y acotado | Fuel | Umbrales absolutos y cálculo por vueltas demostrable; no Virtual Energy. |
| Aprobado y acotado | Penalties | Solo existe evidencia del contador genérico; no se autoriza afirmar el tipo. |
| Aprobado y acotado | Laps | Transición `lap_completed`; no game phase ni mensajes de final. |
| Aprobado y acotado | Timings | `gap_report` sobre gaps canónicos comparables. |
| Aprobado y acotado | Pitstops | Solo `entry` y `exit`. |
| Parcial, bloqueado | Opponents, Multiclass, Watched opponents, Position, Push, Race time, Session end, Pearls, Strategy | `family_not_approved`. |
| Deshabilitado | Engine, Tyre, Flags, Driver swaps, Damage, Conditions | `family_not_approved`. |

La familia puede estar aprobada y una decisión concreta no estarlo. El runner
mantiene una allowlist explícita de las decisiones caracterizadas; todo mensaje
legacy que exceda esa lista aparece como `unavailable / decision_not_approved`.

ENG-05 conserva la `ValidityRule` de Spotter como un claim semántico tipado y
construye evidencia fija desde cada observación. Antes de emitir, la policy
vuelve a comprobar el claim contra la observación más reciente. El runner
demuestra que un `car_left` retenido no se emite después de que el coche haya
dejado la zona. Combustible, pit, sanciones, vueltas y timings siguen el mismo
contrato fail-closed sin expresiones libres ni acceso a telemetry raw.

## Hallazgo resuelto por ENG-05

El runtime legacy de `pitstops` produce, al observar una entrada/salida, avisos
de box-now, limitador, velocidad, ventana y tráfico además de `entry`/`exit`.
TC-08C solo demostró entrada y salida. ENG-05 conserva todos esos resultados
para diagnóstico, pero la policy solo admite `entry` y `exit`.

El monitor de penalizaciones recibe únicamente un contador genérico y, en
ausencia del antiguo reader Extended, lo etiqueta por defecto como
`penalties.new_drivethrough`. Ese contador no demuestra un drive-through.
ENG-05 lo transforma en la intención neutral `penalties.count_increased` en la
frontera test-only; el claim específico nunca atraviesa la policy. ENG-04 y el
runtime productivo no adquieren nuevas señales.

## Reproducibilidad y goldens

Los datos de `testdata/` son sintéticos y sanitizados. El escenario principal
recorre las seis familias autorizadas y se ejecuta veinte veces byte a byte
antes de compararse con el golden v1. Los tests adicionales cubren todos los
estados, las 15 familias parciales/deshabilitadas, límites, epoch/identidad,
hechos, freshness, capabilities y versiones desconocidas.

Un cambio deliberado requiere revisar el diff completo del golden. No existe
un modo automático de regenerarlo dentro de la suite ni una ruta productiva
que lo cargue.

## Presupuestos y aislamiento

- Máximo 4.096 pasos por escenario.
- Máximo 21 familias y 64 hechos por paso.
- Máximo 104 vehículos por snapshot, igual que Telemetry Core.
- Máximo 256 mensajes pendientes y 16.384 resultados.
- Cero goroutines, timers reales, sleeps o colas sin límite añadidos.
- Cero dependencias nuevas.

La ausencia de wiring se verifica buscando consumidores fuera del paquete y
comprobando que `cmd/vantare` no lo incluye entre sus dependencias. Un futuro
uso de producto debe crear otra issue y no convertir este harness en fuente.

## Evidencia fresca

- Replay oracle x50 tras re-review: PASS.
- Regresión ENG-03 de procedencia/calidad x20: PASS.
- `internal/engineer/...`: PASS.
- `internal/telemetry/...`: PASS.
- Suite Go global serial: PASS.
- Race del oracle x10 con GCC UCRT64 configurado solo para el proceso: PASS.
- Vet del oracle: PASS. El vet amplio conserva dos avisos heredados de
  `unsafe.Pointer` en el driver Win32 LMU, fuera del diff.
- Build frontend: PASS, ejecutado para generar el `dist` ignorado que exige el
  embed Go; no hay cambios frontend tracked.
- Búsqueda de consumidores y grafo de dependencias de `cmd/vantare`: cero
  referencias a `replayoracle`.
- `git diff --check`: PASS.
- Re-review independiente: `ACCEPT`, P0/P1/P2/P3 = 0.

ENG-06 mantiene el runtime productivo fuera de este paquete, pero actualiza el
oráculo y su golden v2 para que una regresión no vuelva a tratar `Next` como
audio escuchado. El runner sigue sin goroutines, I/O o audio real.

La primera suite global paralela reprodujo la contención Windows conocida de
`TestConcurrentSavesDontCorruptFile`; la repetición global serial pasó. El
primer intento race no tenía el directorio de runtime GCC en `PATH`; al
configurarlo únicamente para el proceso, el mismo gate x10 pasó.

## Rollback y siguiente corte

Rollback: revertir el commit de ISA-133. No hay datos, migraciones ni estado
persistente que recuperar.

ENG-05 define policy/scheduler a partir de estas evidencias en
`docs/engineer/message-policy-scheduler.md`. ENG-06 conserva el oráculo como
test-only y añade el golden v2 para las fronteras de dispatch/start.
