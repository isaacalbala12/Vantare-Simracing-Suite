# ISA-894 — diagnóstico S1 ON 2026-08-30

Fuente local: `results/isa-894/sesiones/s1-on-20260830-192729/`, capturada
durante 20 minutos con `bin/vantare-sesiones.exe` (`d6c7cc03…`, HEAD
`533783e1`). La higiene y el cierre fueron limpios. El fallo final del colector
no invalida las 21 muestras de procesos ni los cinco checkpoints CDP.

## Paridad

- Los 284 mismatches `stale` y los 7 de transición no eran una comparación en
  vivo. El shadow ahora omite todos los campos fuera de `live` y registra una
  razón explícita como `stale-phase`.
- `standings.remainingText` produjo 138 mismatches `live`. Ambos builders usan
  el mismo formato; el problema era comparar una sección `standings` nueva con
  el reloj `session` V2 cacheado. El widget solo es comparable cuando ambas
  secciones pertenecen al cursor actual. El campo sigue siendo exacto.
- El historial de controles produjo 166/166/84 mismatches `live` en
  throttle/clutch/brake. V1 muestrea al llegar el snapshot al navegador y V2
  publica un ring derivado en Go sin timestamp de origen por muestra. Emparejar
  por índice no empareja observaciones. El historial queda `partial`; los
  controles instantáneos conservan su comparación exacta.

## Memoria observada

| Proceso | Muestras | Pendiente Private Bytes | Primero → último |
| --- | ---: | ---: | ---: |
| renderer no asignado PID 8020 | 21 | +825,8 MiB/h | 85,5 → 506,9 MiB |
| renderer no asignado PID 6620 | 21 | +311,5 MiB/h | 51,6 → 164,3 MiB |
| GPU process PID 11448 | 21 | +119,7 MiB/h | 210,5 → 235,1 MiB |
| Go host PID 14152 | 21 | +23,8 MiB/h | 68,5 → 77,8 MiB |
| browser PID 11456 | 21 | +15,0 MiB/h | 46,6 → 49,3 MiB |

Los dos renderer quedaron `unassigned`: esa corrida no capturó PID por target
y tampoco capturó heap JS. Por tanto no es válido llamar al PID 8020 “overlay”
ni atribuir sus 825,8 MiB/h íntegramente al shadow. Con esta única fase, la
contribución cuantificable del shadow al crecimiento de cada renderer queda
entre 0 y la pendiente total observada; S1 OFF aporta el diferencial.

La auditoría del código no encontró una colección shadow ilimitada: pendientes
V1, pendientes V2 y secuencias comparadas rotaban a 64; el historial V1 a 120
muestras; y la corrida publicó 35 claves de métricas. Sí encontró presión de
asignación evitable: los 5.426 frames comparables `live` reconstruían cada vez
el historial V2 de hasta 120 muestras y filtraban el ring V1, aunque el historial
no podía compararse. Eso supone hasta 651.120 objetos de muestra V2, además de
5.426 arrays V1, creados durante la fase solo para el diagnóstico.

El arreglo elimina por completo el historial del shadow, mantiene únicamente
los valores instantáneos, fija un techo defensivo de 128 claves de métricas y
publica en cada diagnóstico los tamaños retenidos (`pendingLegacy`,
`pendingOverlayV2`, `comparedSequences`, `metricKeys`). El colector añade por
target CDP `JSHeapUsedSize`, `JSHeapTotalSize`, documentos, nodos y listeners.
Esto permite que la siguiente fase ON distinga heap vivo, reserva de V8 y
Private Bytes del proceso.

## Veredicto

La pendiente S1 ON es un **FAIL real del gate de memoria**, no se maquilla. La
cruda demuestra presión de asignación del shadow, pero no demuestra por sí sola
qué renderer es el overlay ni que todo su crecimiento quede retenido por el
shadow. La corrección requiere repetir ON con la instrumentación nueva y
compararla contra OFF antes de declarar resuelta la pendiente.
