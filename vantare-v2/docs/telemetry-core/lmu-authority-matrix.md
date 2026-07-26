# LMU — matriz de autoridad y fusión por campo

Estado: ISA-34 / TC-03E, matriz `v1`.

## Contrato

`internal/telemetry/drivers/lmu` conserva como máximo la última observación
tipada de Shared Memory y la última de REST. Cada entrada produce un lote
canónico `Observation` con `SourceCanonical`, versión de matriz, una decisión
por campo y conflictos acotados. No conserva ni expone bytes raw, JSON, nombres
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
| 1 | `session.source-time` | Shared Memory | REST | 500 ms | 2 s |
| 2 | `session.track-name` | Shared Memory | REST | 500 ms | 2 s |
| 3 | `session.type` | Shared Memory | REST | 500 ms | 2 s |
| 4 | `session.vehicle-count` | Shared Memory | REST | 500 ms | 2 s |
| 5 | `vehicle.player-present` | Shared Memory | REST | 500 ms | 2 s |
| 6 | `vehicle.name` | Shared Memory | ninguna | 500 ms | — |
| 7 | `session.lap-number` | Shared Memory | ninguna | 500 ms | — |
| 8 | `vehicle.gear` | Shared Memory | ninguna | 500 ms | — |
| 9 | `vehicle.engine-rpm` | Shared Memory | ninguna | 500 ms | — |
| 10 | `vehicle.speed-mps` | Shared Memory | ninguna | 500 ms | — |
| 11 | `controls.inputs` | Shared Memory | ninguna | 500 ms | — |
| 12 | `standings.player-position` | REST | ninguna | 2 s | — |
| 13 | `standings.completed-laps` | REST | ninguna | 2 s | — |
| 14 | `pit.stop-count` | REST | ninguna | 2 s | — |

Los cinco primeros son todo el solapamiento demostrado por los contratos
actuales. Los seis siguientes son señales rápidas o de vehículo demostradas
solo en Shared Memory. Los tres últimos proceden realmente de standings REST.
Ampliar esta tabla exige una nueva versión, evidencia de semántica/unidad y
tests; no se reutilizan IDs ni se activa una alternativa por conveniencia.

## Verificación

Automática:

```powershell
go test ./internal/telemetry/drivers/lmu -count=1
go test ./internal/telemetry/... -count=1
```

La suite cubre matriz completa, preferred stale/invalid/missing, REST parcial,
recuperación, cero válido, conflicto, límite TTL, orden determinista, fuzz,
benchmark y lifecycle/cancelación heredado del único driver.

Manual (gate TC-03, no ejecutado en ISA-34): con LMU real, observar conexión y
desconexión read-only, confirmar transición honesta de estado y que no aparece
telemetría ficticia. No cerrar ni manipular LMU desde el harness. Esta prueba
queda para Isaac antes de TC-04.
