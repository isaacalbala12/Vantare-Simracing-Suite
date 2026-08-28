# ISA-912 — perfil del host Go y del renderer Overlay

Estado: instrumentación y matriz B de tres repeticiones completadas. Las dos
primeras optimizaciones propuestas quedan NO-GO: una movía trabajo al publish
y la otra reducía allocations, pero no superó el gate runtime sin regresiones.

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
  `Performance.getMetrics`, trace de timeline/GC y perfil CPU V8 muestreado.
- Procesos: CPU y Private Bytes por PID/rol con reloj común.
- Datos crudos: perfil `.pprof`, trace CDP y series JSON. No contienen frames de
  telemetría; antes de versionar se revisan tamaño y contenido.

No se añaden dependencias, endpoints, payloads productivos ni telemetría de
producto.

### Capturador WebView2 schema v2

`frontend/scripts/isa-912-webview-profile.mjs` escribe resúmenes con schema
`vantare.isa-912.webview-profile.v2` y separa tres modos para no atribuir al
producto el coste del propio instrumento:

- `--mode trace`: métricas, rAF/long tasks y trace de timeline/GC; conserva el
  comportamiento completo del schema v1 y escribe también `.trace.json`;
- `--mode metrics`: solo métricas y sonda de renderer, sin tracing ni profiler;
- `--mode profile`: métricas y perfil CPU V8 mediante CDP `Profiler`, con
  intervalo acotado por `--sampling-us`; escribe `.cpuprofile` y añade al
  resumen las funciones con mayor self time.

El resumen de CPU conserva únicamente el basename del script y elimina query,
fragmento y directorios absolutos. Un guard rechaza perfiles sin funciones
legibles o dominados por nombres minificados. El `.cpuprofile` crudo sí puede
contener URLs o rutas del host: queda ignorado por Git, permanece fuera del
repo y se revisa antes de compartir igual que los traces crudos.

Gate focal del resumen sanitizado:

```powershell
corepack pnpm --dir frontend test:isa912-cpuprofile
```

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

Esa primera repetición priorizó `Hub.ReplaySnapshot`: reserializa en cada pull
el `Envelope` cuyo `Payload` V1 ya es `json.RawMessage`, mientras el publisher
V2 retiene el evento codificado. Las dos variantes mínimas se evaluaron después
contra el gate completo y se rechazaron, como se documenta a continuación. La
retirada de V1 sigue bloqueada hasta que #893 demuestre autoridad/paridad V2 y
#894 acredite consumidores V1 cero.

## Dos cortes descartados por el gate

La implementación se detuvo antes de integrar la hipótesis anterior. Retener
el evento codificado dentro de `Hub.PublishSnapshot` habría hecho parecer casi
gratuito el benchmark del pull porque ese benchmark excluye deliberadamente la
publicación del reloj. No habría demostrado menos trabajo del host:

- LMU entrega aproximadamente 64 lotes/s;
- la captura real observó 43,63 pulls/s;
- codificar al publicar movería `json.Marshal` a la fase más frecuente;
- además lo ejecutaría con Hub solo, donde el control registró cero pulls.

Ese cache queda **NO-GO**. No se añadió contador, invalidación, consumidor
especial ni segunda representación retenida.

El segundo candidato mantenía exactamente una codificación a demanda por pull.
`PublishSnapshot` seguía tomando ownership mediante una copia; al reproducir,
el Hub copiaba por valor el `Envelope` inmutable bajo el mutex y dejaba que
`json.Marshal` produjera los bytes independientes del caller. Así eliminaba la
copia profunda inmediatamente anterior al marshal sin cambiar JSON, frecuencia,
contrato, lifecycle ni V1/V2.

En el mismo Ryzen 7 3700X y con el fixture de 44 coches, cinco repeticiones de
300 iteraciones comparadas contra el worktree read-only revisado por Fable
midieron:

| Variante | Baseline mediana | Candidato mediana | Cambio estable |
| --- | ---: | ---: | ---: |
| dual, B/op | 670.005 | 525.970 | -21,5 % |
| v1-only, B/op | 605.953 | 460.713 | -24,0 % |
| dual, allocs/op | 17-18 | 15-16 | -2 allocations típicas |
| v1-only, allocs/op | 13-14 | 12-13 | -1 allocation típica |

El tiempo de benchmark fue ruidoso: V1-only mejoró alrededor de 8,7 % por
mediana, por debajo del gate de 10 %, mientras dual osciló en sentido contrario.
Los bytes acreditaban menos churn por pull, pero no bastaban para aceptar el
cambio sin el A/B Wails/LMU equivalente.

El control de Hub solo registró 0 pulls, host 20,72 % de un core y árbol 35,30 %.
CDP observó rAF p99 8,5 ms, cero frames >32 ms y cero long tasks. Está en el
rango anterior (18,74 % host; 38,06 % árbol) y confirma que el candidato no
añadía marshal al publish sin consumidor.

Después se alternaron builds diagnósticas del commit base `f52eaca7` y del
candidato sobre la misma práctica LMU, perfil, dos widgets, WebView2 y ventanas.
Cada variante conservó tres series de proceso a 100 ms, tres perfiles Go y tres
capturas CDP de 30 s. Las medianas fueron:

| Métrica B | Baseline | Candidato | Cambio |
| --- | ---: | ---: | ---: |
| Host medio, % de un core | 37,65 | 37,98 | +0,9 % |
| Host p95, % de un core | 83,02 | 85,79 | +3,3 % |
| Host máximo, % de un core | 151,95 | 166,15 | **+9,3 %** |
| Árbol medio, % de un core | 141,16 | 141,63 | +0,3 % |
| Árbol p95, % de un core | 223,91 | 226,64 | +1,2 % |
| Renderer medio, % de un core | 56,81 | 57,96 | +2,0 % |
| Renderer p95, % de un core | 113,11 | 118,93 | **+5,1 %** |
| `TaskDuration` | 10,079 s | 9,873 s | -2,0 % |
| `ScriptDuration` | 2,775 s | 2,777 s | +0,1 % |
| Pulls/s | 43,49 | 44,00 | +1,2 % |
| rAF p99 / máximo | 8,5 / 9,4 ms | 8,5 / 9,6 ms | estable |
| Frames >32 ms / long tasks | 0 / 0 | 0 / 0 | igual |

`pprof` tampoco acreditó la victoria de CPU: la mediana acumulada de
`Hub.ReplaySnapshot` bajó 0,62 -> 0,56 s (-9,7 %, aún bajo el 10 %) y
`json.Marshal` pasó 1,89 -> 1,94 s (+2,6 %). Los máximos de proceso son más
ruidosos que la media y el p95, pero el gate era vinculante antes de medir. El
candidato no mejoró la CPU del host y dos secundarios superaron 5 %. Por tanto
queda **NO-GO**, se retiró completo de producción y tests, y no se presenta la
reducción aislada de B/op como optimización entregada.

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
| `vantare-isa912-copy-overlay-20260828172054.pprof` | 45.923 | `E9299E4DCBACD246DDE47D354ACD6A37D06A2C455677D39F7FC397847CCC6C14` |
| `vantare-isa912-copy-overlay-20260828172054.json` | 78.883 | `E2A8F235191A6F279E6E3DAB1EE844B74917AE55D38F67E9FDA779668E361B49` |
| `vantare-isa912-copy-overlay-20260828172054.trace.json` | 53.827.101 | `83AF39656215EEC36478BE8A66E10CAC0B7105BBC67896C01F8E46B4400C06A4` |
| `vantare-isa912-baseline-overlay-20260828172917.pprof` | 51.188 | `9DA937F95879567AD789C1CE1EC3774F4BB8265014EE7F500007B342406748AD` |
| `vantare-isa912-baseline-overlay-20260828172917.json` | 79.149 | `1558949F3B08AFCCD3B4E94607D916DDB463983453DE2FE976E630780EC5F756` |
| `vantare-isa912-baseline-overlay-20260828172917.trace.json` | 56.750.810 | `57AF3257B5CD6585BE768361CFCBD877CE111AF7BE413BF7F3B8FDFF10630617` |
| `vantare-isa912-candidate2-overlay-20260828173122.pprof` | 44.892 | `3FEB55B18F23581914EC40AC3E8D7ECC9279A0C64335215F00104007E2E0C167` |
| `vantare-isa912-candidate2-overlay-20260828173122.json` | 79.037 | `955C11C227A736C2B142E7DEC851E42B3CE43A777FCADCD567741B28E4F3EB52` |
| `vantare-isa912-candidate2-overlay-20260828173122.trace.json` | 54.816.637 | `E0D03C69363A009264F65AEA701565B0D42A61E1324E42124B3B58FAAE33B072` |
| `vantare-isa912-baseline3-overlay-20260828173307.pprof` | 47.085 | `B8883730886D4FB871E0B0F3081DFE07D44225F0F2A64CD153B240DE031155A0` |
| `vantare-isa912-baseline3-overlay-20260828173307.json` | 79.023 | `40C4F0D561745D5E49E2FC2E9BF6D3CFD840F6349DB35FE82F55285F6A13A8CC` |
| `vantare-isa912-baseline3-overlay-20260828173307.trace.json` | 53.564.951 | `1BE5136E8E4CBF360D6555A55E8C0C7926532739FFCE048F706D19996C03FEA1` |
| `vantare-isa912-candidate3-overlay-20260828173455.pprof` | 47.870 | `7CDB2E6EAE89410B8A8B327EEBF1FB4A637BBE8C16968CFCD883C47DFC8DECAB` |
| `vantare-isa912-candidate3-overlay-20260828173455.json` | 79.106 | `FEA4283FF9795D49BFADCC6F50301330795823F4CE09FA24BB234F19CEBDB5A5` |
| `vantare-isa912-candidate3-overlay-20260828173455.trace.json` | 55.389.810 | `0E13165180A7C47F63263E307AC005B546EFC6AD2C8EAFFB58B065F9DE8637E5` |
| `vantare-isa912-baseline4-overlay-20260828173845.pprof` | 48.274 | `3F5954B73EE1663E6405565B7B5BE378FF1981BFCCAE470E68713113353E7C0D` |
| `vantare-isa912-baseline4-overlay-20260828173845.json` | 79.129 | `7022CA806B532A151046E946B270A6909C78A68762A3C5C7EC65A5902A6C7A51` |
| `vantare-isa912-baseline4-overlay-20260828173845.trace.json` | 54.591.968 | `FAF6EF8952DEB4F8BA6FCA542B4EF750E8AD4F5B763F94583EB59F8DD84F5DE2` |

Al aparecer el fichero pprof, el sampler enumeró el PID host y sus descendientes
con `Win32_Process`, clasificó `browser`, `renderer`, `gpu-process`, `utility` y
`crashpad-handler` desde `--type`, y tomó CPU acumulada y Private Bytes a 100 ms.
El porcentaje medio de un core es
`100 * (CPU_final - CPU_inicial) / segundos_reales`; p95 y máximo proceden de
los deltas de cada intervalo. Las tres series actuales de cada variante
conservaron 169-176 muestras, además de 61 muestras CDP por captura.

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
3. Cache en publicación: NO-GO porque desplaza trabajo a una frecuencia mayor.
4. Copia superficial previa al marshal: NO-GO tras el A/B de tres repeticiones.
5. Elegir el siguiente corte solo desde un hotspot que pueda superar el gate.
6. #893 promueve V2 con paridad de todos los widgets.
7. #894 demuestra consumidores V1 cero y retira V1.
8. Perfil final sin V1 para cuantificar el beneficio real.

No se mezclan lifecycle #896, CSS/blur, flags GPU, rediseño visual, nueva
arquitectura, dependencias ni cambios indiscriminados de cadencia.
