# LMU — matriz de autoridad y fusión por campo

Estado: ISA-34 / TC-03E, matriz `v1`.

## Contrato

`internal/telemetry/drivers/lmu` conserva como máximo la última observación
tipada que llegó de Shared Memory y la última que llegó de REST. Cada entrada produce un lote
canónico `Observation` con `SourceCanonical`, versión de matriz, una decisión
por señal del catálogo y conflictos acotados a cinco. El orden de llegada y la
edad se registran con secuencia/tiempo monotónico internos; UTC es solo metadata
observable y nunca decide qué muestra es la más reciente ni cuándo vence el TTL.
No conserva ni expone bytes raw, JSON, nombres
de piloto, rutas o payloads diagnósticos. La salida canónica tampoco conserva el
snapshot REST interno: los consumidores solo ven el resultado de autoridad.

El orden de calidad es `fresh` válido, `stale` válido, `invalid` y `missing`;
dentro de la misma calidad manda la fuente preferida. `0`, `false` y texto vacío
presente no significan ausencia. Si la fuente preferida no es usable, solo se
admite una alternativa marcada como semánticamente equivalente. Si ninguna
fuente aporta valor se emite `missing`; nunca se inventa un valor.

Cuando dos alternativas usables discrepan, gana la preferida. No se promedian
valores ni se sustituyen sesiones, standings u otros bloques. El diagnóstico
solo contiene ID de campo y fuentes en conflicto; la calidad seleccionada vive
en la decisión del campo y no se incluyen valores.

## Matriz v1

| Orden | Campo estable | Preferida | Alternativa equivalente | TTL preferida | TTL alternativa |
|---:|---|---|---|---:|---:|
| 1 | `session.source_time` | Shared Memory | REST | 500 ms | 2 s |
| 2 | `session.track_name` | Shared Memory | REST | 500 ms | 2 s |
| 3 | `session.type` | Shared Memory | REST | 500 ms | 2 s |
| 4 | `session.vehicle_count` | Shared Memory | REST | 500 ms | 2 s |
| 5 | `vehicle.player_present` | Shared Memory | REST | 500 ms | 2 s |
| 6 | `vehicle.name` | Shared Memory | ninguna | 500 ms | — |
| 7 | `session.lap_number` | Shared Memory | ninguna | 500 ms | — |
| 8 | `vehicle.gear` | Shared Memory | ninguna | 500 ms | — |
| 9 | `vehicle.engine_rpm` | Shared Memory | ninguna | 500 ms | — |
| 10 | `vehicle.speed_mps` | Shared Memory | ninguna | 500 ms | — |
| 11 | `controls.throttle` | Shared Memory | ninguna | 500 ms | — |
| 12 | `controls.brake` | Shared Memory | ninguna | 500 ms | — |
| 13 | `controls.clutch` | Shared Memory | ninguna | 500 ms | — |
| 14 | `standings.position` | REST | ninguna | 2 s | — |
| 15 | `standings.completed_laps` | REST | ninguna | 2 s | — |
| 16 | `pit.stop_count` | REST | ninguna | 2 s | — |

Los cinco primeros son todo el solapamiento demostrado por los contratos
actuales. Los ocho siguientes son señales rápidas o de vehículo demostradas
solo en Shared Memory. Los tres últimos proceden realmente de standings REST.
Ampliar esta tabla exige una nueva versión, evidencia de semántica/unidad y
tests; no se reutilizan IDs ni se activa una alternativa por conveniencia.

## Equivalencia de los cinco solapamientos

| Señal canónica | Shared Memory raw | Endpoint/campo REST | Unidad canónica | Normalización común | Divergencia conocida y regla | Evidencia automática |
|---|---|---|---|---|---|---|
| `session.source_time` | `LMU_Data` scoring, `float64` offset 1700 | `/rest/watch/sessionInfo.currentEventTime` | `time.Duration` desde segundos | Una sola conversión acotada: rechaza negativo, NaN, infinito y overflow; conserva cero | Las fuentes se muestrean en instantes distintos. Solo se compara/fusiona el valor canónico válido; no se interpola | `TestOverlapNormalizationsAreEquivalent/source_time_bounded_conversion` y límites REST |
| `session.track_name` | C string UTF-8 de 64 bytes, offset 1632 | `/rest/watch/sessionInfo.trackName` | texto | `normalizeTrackName`: elimina espacio exterior en ambos bordes | REST puede quedar vacío durante transición; vacío presente no se inventa como ausencia. Freshness y autoridad deciden | `TestOverlapNormalizationsAreEquivalent/track_name`, fixtures SHM y validación transaccional REST |
| `session.type` | `int32` offset 1696: 1 practice, 3 qualify, 4/5 race | `/rest/watch/sessionInfo.session`: prefijos `PRACTICE`, `QUALIFY`, `RACE`, `WARMUP` | `schema/session.Type` | Ambos decoders producen el mismo enum para practice/qualify/race | REST observa `warmup`, sin código SHM demostrado; sigue siendo un valor canónico REST válido cuando SHM no aporta uno. No se equipara a otra fase | `TestOverlapNormalizationsAreEquivalent/session_type` y tests unitarios de ambos decoders |
| `session.vehicle_count` | `int32` offset 1736 | `/rest/watch/sessionInfo.numberOfVehicles` | `schema.Count` | Mismo rango cerrado 0–104; cero es válido | Una respuesta REST parcial puede retrasarse respecto al scoring; no se suman ni promedian conteos | `TestOverlapNormalizationsAreEquivalent/vehicle_count` y validación de rangos |
| `vehicle.player_present` | byte booleano offset 128466, solo 0/1 válido | `/rest/watch/standings`: existe una fila con `player=true` | booleano | Shared Memory valida 0/1; REST reduce las filas válidas con `any(player)` | REST vacío significa `false` observado para ese snapshot, pero un endpoint fallido conserva freshness previa; no confunde fallo con ausencia | `TestOverlapNormalizationsAreEquivalent/player_present`, tests de standings y fixtures SHM |

La alternativa solo opera después de estas transformaciones. Los tests comparan
ambas rutas con casos table-driven; no existe una segunda conversión de
`source_time`.

## Verificación

Automática:

```powershell
go test ./internal/telemetry/drivers/lmu -count=1
go test ./internal/telemetry/... -count=1
```

La suite cubre matriz completa 1:1 con `catalog.Definitions`, preferred
stale/invalid/missing, REST parcial, recuperación, cero válido, las cuatro
combinaciones fresh/stale en conflictos, clamp explícito a cinco, borde TTL,
saltos del reloj civil, orden de llegada, equivalencias, fuzz, benchmark y
lifecycle/cancelación heredado del único driver.

Manual (gate TC-03, no ejecutado en ISA-34): con LMU real, observar conexión y
desconexión read-only, confirmar transición honesta de estado y que no aparece
telemetría ficticia. No cerrar ni manipular LMU desde el harness. Esta prueba
queda para Isaac antes de TC-04.
