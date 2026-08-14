# LMU — matriz de autoridad y fusión por campo

Estado histórico: ISA-129 / TC-07A.1, microcorte D4A. Este documento conserva
la matriz ejecutable `v3` auditada en ese corte.

Nota vigente ISA-160 / TC-10A (2026-08-11): el runtime productivo actual es
`MatrixVersion=5`, definido por `authorityMatrixV4` y expuesto mediante
`AuthorityMatrix()` en `internal/telemetry/drivers/lmu/fusion.go`. V4 conservó
las 33 reglas v3 siguientes y añade al final las tres señales SHM-only
`spatial.position`, `spatial.orientation` y `spatial.local_velocity`, todas con
TTL de 500 ms. V5 añade `session.native_delta_best`, también SHM-only y con TTL
de 500 ms. La fuente de verdad ejecutable es `fusion.go`, protegida por
`fusion_test.go` y por los contrastes no circulares de
`strategy_signal_audit_test.go`. Esta nota no reinterpreta la evidencia
histórica D4A ni amplía las señales Strategy admitidas.

## Contrato

`internal/telemetry/drivers/lmu` conserva como máximo la última observación
tipada de Shared Memory y la última de REST. Cada entrada produce una
`Observation` canónica con una decisión por señal admitida. La secuencia y la
edad monotónica gobiernan autoridad y TTL; UTC es solo metadata.

Shared Memory es la fuente atómica de sesión y parrilla. REST solo puede
completar los ocho solapamientos demostrados. En posición, vueltas completadas
y paradas, REST se aplica exclusivamente a la fila que Shared Memory ya marcó
como jugador. No crea filas, IDs, rivales ni identidad de jugador.

El orden de selección es:

1. preferida fresh;
2. alternativa equivalente fresh;
3. preferida stale;
4. alternativa equivalente stale;
5. preferida invalid/presente;
6. alternativa equivalente invalid/presente;
7. missing.

`0`, `false` y texto vacío presente son valores. Una discrepancia entre valores
comparables genera un diagnóstico acotado a cinco, pero no cambia la autoridad.
La salida nunca conserva el snapshot REST privado ni bytes raw.

## Matriz v3

TTL Shared Memory: `500 ms`. TTL REST: `2 s`.

| Orden | Señal canónica | Preferida | Alternativa equivalente | Scope |
|---:|---|---|---|---|
| 1 | `session.source_time` | SHM | REST | sesión |
| 2 | `session.track_name` | SHM | REST | sesión |
| 3 | `session.type` | SHM | REST | sesión |
| 4 | `session.vehicle_count` | SHM | REST | sesión; REST no crea grid |
| 5 | `vehicle.player_present` | SHM | REST | REST no crea identidad |
| 6 | `identity.driver_name` | SHM | — | cada fila scoring |
| 7 | `vehicle.name` | SHM | — | cada fila scoring |
| 8 | `standings.completed_laps` | SHM | REST | REST solo jugador identificado |
| 9 | `pit.stop_count` | SHM | REST | REST solo jugador identificado |
| 10 | `standings.position` | SHM | REST | REST solo jugador identificado |
| 11 | `pit.in_pit` | SHM | — | cada fila scoring |
| 12 | `session.lap_number` | SHM | — | telemetry del jugador |
| 13 | `vehicle.gear` | SHM | — | telemetry del jugador |
| 14 | `vehicle.engine_rpm` | SHM | — | telemetry del jugador |
| 15 | `vehicle.speed_mps` | SHM | — | telemetry del jugador |
| 16 | `controls.throttle` | SHM | — | telemetry del jugador |
| 17 | `controls.brake` | SHM | — | telemetry del jugador |
| 18 | `controls.clutch` | SHM | — | telemetry del jugador |
| 19 | `session.end_time` | SHM | — | sesión |
| 20 | `session.maximum_laps` | SHM | — | sesión |
| 21 | `vehicle.class` | SHM | — | cada fila scoring |
| 22 | `standings.sector` | SHM | — | cada fila scoring |
| 23 | `standings.lap_distance` | SHM | — | cada fila scoring |
| 24 | `standings.best_lap_time` | SHM | — | cada fila scoring |
| 25 | `standings.last_lap_time` | SHM | — | cada fila scoring |
| 26 | `standings.estimated_lap_time` | SHM | — | cada fila scoring |
| 27 | `standings.penalty_count` | SHM | — | cada fila scoring |
| 28 | `standings.time_behind_leader` | SHM | — | cada fila scoring |
| 29 | `standings.laps_behind_leader` | SHM | — | cada fila scoring |
| 30 | `standings.time_behind_next` | SHM | — | cada fila scoring |
| 31 | `standings.laps_behind_next` | SHM | — | cada fila scoring |
| 32 | `energy.fuel_amount` | SHM | — | telemetry del jugador |
| 33 | `energy.fuel_capacity` | SHM | — | telemetry del jugador |

La matriz es cerrada, ordenada y copiada al exponerla. Ampliarla requiere una
nueva versión, evidencia de significado/unidad y tests. Las decisiones de
señales por vehículo resumen la autoridad del grid; la presencia y calidad
exactas permanecen en cada `schema.Field` de cada fila.

## Equivalencia de los ocho solapamientos

| Señal | Normalización/comparación | Regla de fallback |
|---|---|---|
| `session.source_time` | Proyectar ambas muestras al instante de decisión mediante su edad monotónica; conflicto solo si la diferencia es `>500 ms` | REST solo si SHM no usable |
| `session.track_name` | trim exterior común y comparación exacta | REST solo si SHM no usable |
| `session.type` | enum canónico cerrado | REST desconocido nunca sustituye SHM válido |
| `session.vehicle_count` | entero exacto `0..104` | REST puede describir count, nunca crear filas |
| `vehicle.player_present` | booleano exacto | sin slot SHM, REST no crea identidad |
| `standings.position` | one-based `1..104` | solo jugador ya identificado por SHM |
| `standings.completed_laps` | count no negativo | solo jugador ya identificado por SHM |
| `pit.stop_count` | count no negativo | solo jugador ya identificado por SHM |

Fresh SHM gana incluso si REST discrepa. REST fresh puede sustituir SHM
missing, invalid o stale. Si ambos son stale, se conserva SHM stale. Las
comparaciones incluyen cero y `false`. Los valores REST del jugador jamás se
propagan a rivales.

## Staleness del grid

La parrilla es una copia owned de la observación SHM. Si vence el TTL del frame
o `source_time` llega stale, todos los campos presentes del grid pasan a stale
de forma conjunta, incluido `pit.in_pit=false`. Los campos invalid permanecen
invalid y los missing permanecen missing. REST puede refrescar únicamente los
tres campos player-only declarados, sin refrescar el resto del frame.

## Evidencia automática D4A

- matriz v3 exacta, sin duplicados y con los 33 IDs del catálogo;
- tabla de fresh/equal, fresh/conflict, missing, invalid, stale, ambos stale y
  cero para los ocho solapamientos;
- comparación proyectada del reloj de sesión;
- REST limitado al jugador SHM y SHM fresh como autoridad;
- grid completo stale, incluido `InPit=false`;
- conflictos limitados a cinco y decisiones completas.

```powershell
go test ./internal/telemetry/drivers/lmu -count=20
go test ./internal/telemetry/... -count=1
```

La validación LMU 1.4 y el cutover productivo no pertenecen a D4A. La matriz v3
permanece limitada al layout LMU 1.3 hash-pinned hasta D4B.
