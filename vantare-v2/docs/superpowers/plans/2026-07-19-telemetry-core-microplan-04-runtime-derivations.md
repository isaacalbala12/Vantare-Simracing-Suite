# TC-04 — Runtime canónico y derivaciones

**Objetivo:** transformar observaciones del driver en estado coherente, hechos ordenados y datos derivados sin mezclar I/O o decisiones de producto.

## ISA-35 / TC-04A — Reducer single-writer y snapshot inmutable

- Implementar reducer determinista con una única escritura de estado.
- Validar epoch/sequence y rechazar observaciones imposibles o fuera de contrato.
- Aplicar lotes atómicos; no exponer estado parcial.
- Snapshot con ownership inmutable y structural sharing solo si benchmark lo justifica.
- Sin I/O, JSON, logging por muestra, callbacks o productos en el loop.

**Tests:** orden, duplicados, lotes, mutación, race, determinismo y benchmark con 60+ vehículos.

## ISA-36 / TC-04B — SessionCoordinator, relojes y hechos

- Mantener IDs de evento/sesión/coche/equipo/piloto con evidencia/confianza.
- Resolver reconexión breve, cambio de fuente, cambio de piloto y cambio de coche.
- Emitir hechos ordenados: session started/ended, lap completed, pit entered/exited, driver changed, connection lost/recovered.
- Separar hechos de snapshots latest-wins.
- Introducir clock inyectable para tests, no `time.Sleep`.

**Tests:** secuencias completas y propiedades de epoch/identity; número de participantes no resetea sesión.

## ISA-37 / TC-04C — Derivaciones ordenadas y versionadas

- Implementar pipeline lineal explícito: snapshot observado -> derivaciones -> snapshot final.
- Cada derivación declara inputs, outputs, versión, estado/historia y reset.
- Migrar únicamente derivaciones canónicas necesarias: gaps/delta/history cuando su semántica esté aprobada.
- Impedir ciclos y que una derivación consuma su propia salida anterior salvo historia explícita y acotada.
- Advice, estrategia y mensajes Engineer permanecen fuera.

**Tests:** golden/replay, orden, missing inputs, reset de sesión, historia limitada y versión de algoritmo.

## ISA-38 / TC-04D — Fan-out, backpressure y observabilidad

- Publicar snapshot+status inicial atómicos.
- Snapshots latest-wins con buffers limitados.
- Hechos ordenados con política explícita; un consumidor lento no bloquea el reducer.
- Métricas internas: lag, dropped superseded snapshots, queue depth, stale, reconnect y derivation cost.
- Soak, teardown y límites de memoria.

**Política:** si un consumidor pierde una revisión, recibe/resolicita snapshot completo. Nunca reconstruye estado correcto solo desde diffs.

## Gate TC-04

- driver harness -> core -> snapshot/hechos funciona sin Overlay/Engineer;
- determinismo por replay;
- presupuesto de CPU/memoria documentado con baseline;
- ninguna cola ilimitada y ninguna goroutine huérfana;
- review de inmutabilidad y concurrencia aprobado.

## Stop conditions

- I/O o producto dentro del reducer;
- un hecho puede perderse silenciosamente;
- mutable slices/maps cruzan el boundary;
- derivaciones forman DAG dinámico o ciclos;
- los tests necesitan sleeps;
- el rendimiento solo pasa ocultando métricas.
