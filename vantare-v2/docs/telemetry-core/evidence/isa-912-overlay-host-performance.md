# ISA-912 — perfil del host Go y del renderer Overlay

Estado: instrumentación implementada y smoke atribuible Wails/LMU ejecutado;
faltan las tres repeticiones del gate antes de aceptar una optimización.

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

El commit `c834cebe` añade `VANTARE_CPU_PROFILE_DELAY`, también ausente del
build `production`, para separar calentamiento y captura. El retardo es opt-in,
acepta cero para conservar el comportamiento anterior, queda acotado a cinco
minutos y no toca el fichero ni pprof antes de vencer. `stop` cancela la espera,
espera la goroutine y, si el vencimiento ganó la carrera, no retorna hasta que
la captura terminó y el fichero quedó cerrado. La entrega de Opus volvió a
revisarse antes de integrar: se corrigieron dos comentarios contractuales, se
añadió el tercer nombre al guard de producción y se eliminó un test cuyo nombre
afirmaba que el delay había vencido aunque no dejaba transcurrir tiempo.

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

## Smoke real de la instrumentación

La build diagnóstica rebasada sobre `origin/nightly@42f2e368`, con configuración
pública autorizada embebida solo en memoria, arrancó contra LMU Live. El perfil
Go de 30 segundos quedó legible (35.336 B), pero empezó con el proceso y por
tanto mezcló startup con estado estable: se conserva como smoke y no como
baseline A/B.

`pprof` registró 61,44 s de muestras en 30 s y atribuyó 93,4 % plano a
`runtime.cgocall`; los acumulados principales fueron el message loop de hotkeys
y el loop nativo de Wails, aproximadamente 28,4 s cada uno. Diez segundos de
contador del proceso, ya sin profiler activo y con solo Hub, midieron en cambio
15,25 % de un core y 140,2 MiB privados. La diferencia obliga a tratar las
llamadas nativas bloqueantes de `pprof` como atribución de stack, no como CPU
consumida: cada perfil Go se contrastará con el contador externo en la misma
ventana.

El smoke CDP de Hub durante 15 s obtuvo cero pulls y cero long tasks; rAF p50
8,3 ms, p99 8,5 ms, máximo 8,7 ms y cero intervalos superiores a 32 ms. El heap
JS pasó 11,7 → 13,1 MiB, máximo 13,3 MiB. `TaskDuration` acumuló 732 ms,
`ScriptDuration` 50,9 ms y `LayoutDuration` 15,5 ms. Los buckets del trace
pueden contener eventos anidados y no se suman como CPU exclusiva.

Este smoke descubrió un defecto del instrumento: sin retardo no puede respetar
el calentamiento de la matriz. El retardo se corrigió y se verificó primero con
reloj inyectado y `-race`, y después en el proceso Wails real: el fichero no
existió durante el calentamiento, apareció al vencer y se cerró tras 30 s con un
perfil legible.

## Captura dual atribuible, una repetición

Se recompiló el mismo binario diagnóstico, con símbolos y configuración pública
autorizada embebida temporalmente, y se ejecutó sobre la misma práctica LMU
Live. Cada perfil empezó después de alcanzar la topología requerida. Los
contadores externos y CDP arrancaron al aparecer el fichero pprof y cubrieron la
misma ventana de 30 s.

| Métrica | Hub solo | Hub + Overlay |
| --- | ---: | ---: |
| CPU host Go, % de un core | 18,74 | 42,28 |
| CPU árbol completo, % de un core | 38,06 | 109,35 |
| Pulls Overlay | 0 | 1.309 (43,63/s) |
| `TaskDuration` renderer | 1,589 s | 8,368 s |
| `ScriptDuration` renderer | 0,111 s | 2,121 s |
| rAF p99 / máximo | 8,5 / 8,7 ms | 8,6 / 9,0 ms |
| Frames >32 ms / long tasks | 0 / 0 | 0 / 0 |
| Heap JS primero -> último | 11,1 -> 12,7 MiB | 15,2 -> 20,5 MiB |

El incremento observado del host fue 23,54 puntos de un core en la ventana
instrumentada. `pprof` mantuvo prácticamente constante `runtime.cgocall`
(29,28 s Hub; 29,32 s Overlay), por lo que esa pila nativa bloqueante no explica
el diferencial. En Hub, `runtimeBatchSink.WriteBatch` acumuló 1,77 s,
`publishProjections` 1,35 s y `NewOverlayFull` 0,99 s. Con Overlay abierto
subieron a 2,32 s, 1,61 s y 1,09 s; además aparecieron
`OverlayPullTransport.Pull` (0,70 s), `Hub.ReplaySnapshot` (0,66 s) y
`encoding/json.appendCompact` (1,30 s). `json.Marshal` acumuló 0,54 s en Hub y
1,62 s con Overlay. Los deltas Go identificables se concentran en pull y JSON,
pero se solapan y explican solo una fracción de los 7,06 core·s externos de
incremento. El resto —incluidos servidor HTTP/Wails, segunda ventana, GC y
scheduler— sigue sin atribuir; tampoco lo explica el `cgocall` prácticamente
plano.

La traza CDP elevó transitoriamente el renderer Overlay de 120,1 a 322,0 MiB.
No se presenta como fuga de la app: al terminar el tracing el mismo proceso
volvió a 143,6 MiB y, en una ventana limpia posterior de 30 s, pasó a 149,8 MiB.
En esa ventana sin pprof ni CDP, el host consumió 36,49 % de un core, el renderer
Overlay 35,19 %, el browser 14,21 % y el árbol completo 95,36 %; el host pasó
71,3 -> 73,0 MiB y el browser 46,0 -> 45,7 MiB. El trace sirve para atribución
de timeline, pero no para juzgar retención de memoria.

Es una sola repetición y no satisface todavía el gate de tres. Sí basta para
priorizar una hipótesis compatible con el contrato actual: `Hub.ReplaySnapshot`
reserializa en cada pull el `Envelope` cuyo `Payload` V1 ya es `json.RawMessage`,
mientras el publisher V2 retiene el evento codificado. El siguiente corte puede
retener también ese evento V1 ya codificado y repetir A/B sin cambiar datos,
consumidores ni render. La retirada de V1 sigue bloqueada hasta que #893
demuestre autoridad/paridad V2 y #894 acredite consumidores V1 cero.

### Artefactos y método reproducible

Los datos crudos permanecen fuera del repo en el directorio temporal de la
sesión. Estos nombres y hashes permiten comprobar que resumen y perfiles
corresponden a los mismos artefactos sin versionar traces grandes:

| Artefacto | Bytes | SHA-256 |
| --- | ---: | --- |
| `host-hub-delay-02.pprof` | 29.368 | `0A0908A487CA6E948A3ECF2629EC1E971377BE7A04B4C83C370B40AF437C7549` |
| `host-overlay-delay-01.pprof` | 40.653 | `76E08532726BF28E1CE9BACD83807CCFBF81785B7A391EBDDBCA5B8016E53150` |
| `hub-delay-02.json` | 78.108 | `52662E765C0395C913EB3F5A693F8A6FD347BABBFF2B8BB447924DCE8C6BC411` |
| `hub-delay-02.trace.json` | 19.560.003 | `E9DD515F8C5CD1FE8EEEDE72753E76B61A9E41000BD8D630B18CE1848DB33A4E` |
| `overlay-delay-01.json` | 78.670 | `4024267CE3DD463F2F4FB534F071B22A2D89F36851993F943F280ADFC5C56A89` |
| `overlay-delay-01.trace.json` | 33.879.444 | `A9A595494B8C40F185BC7DAD16C5A1F08853747D4121CC9C48F1F510A2BAA004` |

Al aparecer el fichero pprof, el sampler enumeró el PID host y sus descendientes
con `Win32_Process`, clasificó `browser`, `renderer`, `gpu-process`, `utility` y
`crashpad-handler` desde `--type`, tomó `CPU` acumulada y Private Bytes mediante
`Get-Process`, esperó 30 s y repitió sobre los mismos PID. El porcentaje de un
core es `100 * (CPU_final - CPU_inicial) / segundos_reales`. En esta primera
repetición solo se conservaron los extremos mostrados, no la serie a 100 ms; el
gate de tres deberá persistir esa serie antes de aceptar el A/B.

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
3. Evitar que el Hub reserialice el evento V1 ya codificado en cada pull, sin
   cambiar su contrato, y medir el mismo estado.
4. Regresión automatizada y repetición A/B.
5. #893 promueve V2 con paridad de todos los widgets.
6. #894 demuestra consumidores V1 cero y retira V1.
7. Perfil final sin V1 para cuantificar el beneficio real.

No se mezclan lifecycle #896, CSS/blur, flags GPU, rediseño visual, nueva
arquitectura, dependencias ni cambios indiscriminados de cadencia.
