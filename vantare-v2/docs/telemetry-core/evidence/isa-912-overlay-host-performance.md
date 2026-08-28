# ISA-912 — perfil del host Go y del renderer Overlay

Estado: instrumentación implementada; baseline atribuible Wails/LMU pendiente de ejecutar.

Base inicial: `origin/nightly@73b8619114bf6309dced5e04f257762c83b428a5`.

## Objetivo

Medir el pipeline real LMU → Go → pull → WebView2 y reducir únicamente los
costes que el perfil demuestre dominantes. Go conserva la autoridad de
telemetría, `WidgetVisualHost` sigue siendo la única frontera visual y los
widgets no conocen LMU, Wails ni el transporte.

V1 no se retira en este corte. Primero se mide el pipeline dual; #893 debe
demostrar V2 como autoridad visual con paridad y #894 solo puede borrar V1
después de acreditar consumidores cero.

## Evidencia de partida

La prueba LMU/Wails que cerró ISA-891 observó:

- browser WebView2 estable: 56,9 → 57,5 MiB en 14,5 minutos;
- renderers: 193,9 → 463,8 MiB, con ciclos parciales de liberación;
- host Go: 41,9 % medio de un core en 100 muestras de 100 ms, p95 109,4 %,
  p99 156,2 % y máximo 203,1 %;
- renderer Overlay: 43,4 % medio de un core, p95 78,1 %, p99 218,8 % y
  máximo 421,9 %;
- GPU process: 3,8 % medio de un core en esa ráfaga; el motor GPU medido en la
  muestra anterior fue 0,11 % medio / 0,33 % máximo.

Esos porcentajes prueban picos de proceso, no su causa. Más de 100 % significa
trabajo concurrente en varios hilos; no demuestra por sí mismo un repaint.

## Auditoría estática reconciliada

Opus 5 (`claude-opus-5`, thread
`b995e4c1-d11c-474e-8f10-8771a0c63ea1`) auditó el host Go. Fable 5
(`claude-fable-5`, thread `43c006ac-6b4a-495a-9583-93e9e8c5cc33`) revisó la
frontera completa. Ambos trabajaron read-only en worktrees separados; el
orquestador verificó los siguientes hechos en el código:

1. Shared Memory produce a 60 Hz y REST a 4 Hz; ambas observaciones atraviesan
   fusion, mapper, engine y fan-out, aproximadamente 64 lotes/s.
2. El shadow ejecuta reducer, coordinator y derive en cada lote; solo la
   comparación semántica está muestreada.
3. Strategy se proyecta aunque `strategyHub` sea `nil`.
4. Overlay V1 se proyecta, serializa y retiene sin comprobar consumidores.
5. V2 sí comprueba consumidor, pero serializa el frame full cuando está activo.
6. El pull relee y copia payloads antes de responder.
7. Desktop y OBS suscriben el árbol raíz al store V2 aunque las flags estén
   vacías; el watchdog puede notificarlo durante el idle.
8. El coordinador visual acepta `updateHz` pero lo ignora. Las histories y los
   settings visuales se reconstruyen durante los paints.

El peso de cada fase, la actividad real del shadow, la contribución del GC y
el coste de React/layout/paint siguen siendo hipótesis hasta obtener perfiles.

## Instrumentación permitida

- Go: `runtime/pprof` a fichero, solo en builds sin tag `production`, opt-in,
  con duración acotada y sin listener HTTP.
- WebView2: el hook no productivo existente `VANTARE_WEBVIEW_DEBUG_PORT` y CDP
  `Performance.getMetrics` + trace de timeline/GC.
- Procesos: CPU y Private Bytes por PID/rol con reloj común.
- Datos crudos: perfil `.pprof`, trace CDP y series JSON. No contienen frames de
  telemetría; antes de versionar se revisan tamaño y contenido.

No se añaden dependencias, endpoints, payloads productivos ni telemetría de
producto.

## Corte A implementado

El commit `87019bc0` añade dos instrumentos sin cambiar el pipeline:

- perfil CPU Go a fichero, opt-in mediante nombres de variables documentados,
  limitado a 30 segundos por defecto y dos minutos como máximo, sin listener y
  compilado como `noop` con el tag `production`;
- benchmark del pull retenido que publica fuera del reloj y compara, para el
  mismo número de coches, `dual`, `v1-only` y `v2-only`.

La primera entrega del worker no se aceptó: un segundo cierre podía retornar
antes de acabar el flush, el supuesto test timer/shutdown cancelaba el timer y
la atribución V1 comparaba 44 coches duales contra 104 solo V2. El commit final
espera el cierre mediante una señal de finalización, tiene regresión
determinista y elimina esa comparación no equivalente.

Repetición independiente del benchmark a 44 coches, fixture generada y 100
iteraciones por muestra:

| Variante | Rango observado | Allocations | Payloads del fixture |
| --- | ---: | ---: | ---: |
| `dual` | 1,30–1,80 ms/pull | 17–18 | V1 146.480 B + V2 21.678 B |
| `v1-only` | 1,25–1,33 ms/pull | 14 | V1 146.480 B |
| `v2-only` | 17,5–21,5 µs/pull | 10 | V2 21.678 B |

Esto demuestra un hotspot reproducible del sobre V1 dentro de la fase pull con
ese fixture; no demuestra todavía su contribución total en la sesión LMU, ni
autoriza retirarlo antes de #893/#894.

## Matriz reproducible

Cada escenario usa la misma build, sesión LMU, práctica, parrilla, perfil,
sistema visual, resolución/DPI, ventanas y duración:

| Escenario | Hub | Overlay | Objetivo |
| --- | --- | --- | --- |
| A | abierto | cerrado | coste base de adquisición y fan-out sin consumidor Overlay |
| B | abierto | abierto | coste incremental de V1+V2, pull y renderer |
| C | abierto | abrir/cerrar/reabrir | lifecycle, liberación y ausencia de trabajo residual |

Por escenario:

1. calentamiento estable;
2. tres capturas Go de 30–60 s;
3. tres capturas CDP equivalentes sobre el renderer correspondiente;
4. proceso muestreado a 100 ms con roles identificados;
5. después de elegir un corte, A/B sobre el mismo estado;
6. soak de 20 minutos para memoria, separado del perfil CPU corto.

## Métricas de decisión

### Host Go

- top plano y acumulado de `go tool pprof`;
- tiempo/allocations de adquisición, mapper, engine, shadow, proyecciones,
  JSON, pull y GC;
- benchmark focal cuando exista un fixture representativo;
- actividad observable del shadow y fallos de publicación.

### Renderer

- `TaskDuration`, `ScriptDuration`, `LayoutDuration`,
  `RecalcStyleDuration`, counts de layout/style y heap JS;
- rAF p50/p95/p99, frames >32 ms y long tasks;
- trace agregado de script, layout, paint, composición y GC;
- requests pull/s.

### Gate

Se acepta un cambio si mejora al menos 10 % la métrica atribuida en tres
repeticiones y ninguna métrica secundaria empeora más de 5 %. Si el perfil no
encuentra un hotspot suficiente, se documenta NO-GO en vez de añadir
complejidad.

## Orden de cortes

1. Instrumentación sin cambio de comportamiento.
2. Baseline atribuible dual V1+V2.
3. Optimización pequeña del hotspot demostrado.
4. Regresión automatizada y repetición A/B.
5. #893 promueve V2 con paridad de todos los widgets.
6. #894 demuestra consumidores V1 cero y retira V1.
7. Perfil final sin V1 para cuantificar el beneficio real.

No se mezclan lifecycle #896, CSS/blur, flags GPU, rediseño visual, nueva
arquitectura, dependencias ni cambios indiscriminados de cadencia.
