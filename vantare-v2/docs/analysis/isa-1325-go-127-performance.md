# ISA-1325 — rendimiento previo a integrar Go 1.27.1

Fecha: 23/09/2026. [Tarea VAN-747](https://app.notion.com/p/3e3e51695c6581329168eec61e2dbb7e) · [PR borrador #1327](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1327).

## Decisión técnica provisional

La migración funciona en los gates obligatorios de Windows sobre la Nightly actual, pero el backend JSON predeterminado de Go 1.27.1 introduce una regresión reproducible en la publicación del overlay. En el microbenchmark Windows que activa la demanda del overlay, cada `WriteBatch` de 64 vehículos tarda **39,1 % más** y asigna **34,8 % más bytes** que el mismo árbol compilado con Go 1.25.0. Una contraprueba Windows con `GOEXPERIMENT=nojsonv2` recuperó el tiempo y la memoria del caso. Se aplica ese opt-out temporal al candidato y se repetirá el pipeline con la configuración exacta del ejecutable. El PR continúa en borrador. Esta medición no equivale a latencia del juego ni a un ensayo físico con LMU/OBS.

## Árbol y controles funcionales

El candidato `5fc8fff8dd253ab042e51dbe263bf6ab4e4b983e` incorporó `nightly@8b25d076ea9a6ba6be8dc3065bcde978b6d24f07`. El único conflicto de merge fue el digest generado del roadmap; `roadmap_digest.py --ref origin/nightly --check` pasó. En el [run del árbol combinado](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35847190898), promoción/roadmap y el gate Windows completo terminaron `SUCCESS`, incluida la suite Go, las pruebas frontend y la build Wails. [Quality](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35847191220/job/107136083019) devolvió `REVIEW_REQUIRED` por las rutas de política modificadas, con `NEW=0` y `MOVED=0` en todos los analizadores; una incidencia antigua de knip quedó resuelta. No se ha integrado Nightly ni ejecutado release.

## Protocolo del benchmark Windows

Se compiló **el mismo código** con Go 1.25.0 y 1.27.1 en un único runner `windows-latest`, CPU AMD EPYC 7763. El commit de ensayo `11d958469370d5f70028037fc0945216e15e2012` solo añade [el workflow temporal](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/11d958469370d5f70028037fc0945216e15e2012/.github/workflows/isa-1325-go127-windows-bench.yml) a `5fc8fff8`; ningún archivo de producto cambió. Go 1.25.0 utilizó una copia temporal de `go.mod` con únicamente la directiva `go` rebajada y el mismo `go.sum`; `GOTOOLCHAIN=local` impidió el salto automático de versión. Ambas versiones generaron ejecutables de pruebas para proyección, transporte y aplicación.

El [script versionado de microbenchmarks](../../scripts/bench/telemetry-microbench.ps1) ejecutó **diez pares alternos** por paquete con `-test.cpu=1`, `GOMAXPROCS=1`, `-test.benchtime=100ms` y `-test.benchmem`. Guardó hashes de ejecutables, CPU, parámetros, salidas originales y resúmenes como [artefacto del run 35847915247](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35847915247). Los porcentajes de tiempo proceden de `benchstat` sobre las diez muestras de cada versión; también se comprobaron los pares en su orden real. Los artefactos de Actions caducan a los 14 días; [las salidas originales están copiadas junto al informe](isa-1325-go-127-performance-data/README.md).

| Caso Windows | Go 1.25.0 | Go 1.27.1 | Tiempo | Bytes/op | Pares más lentos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Proyección pura, 104 vehículos | 135,2 µs | 115,7 µs | **−14,4 %** | 532,3 → 532,3 KiB | 0/10 |
| Proyección y JSON, cadencia plana, 104 vehículos | 424,3 µs | 462,1 µs | **+8,9 %** | 670,3 → 668,7 KiB | 9/10 |
| Proyección y JSON, cadencia regulada, 104 vehículos | 290,4 µs | 421,6 µs | **+45,2 %** | 304,6 → 303,2 KiB | 10/10 |
| JSON canónico, 44 vehículos | 110,2 µs | 167,0 µs | **+51,6 %** | 29,13 → 27,60 KiB | 10/10 |
| JSON por secciones, 44 vehículos | 120,0 µs | 208,8 µs | **+74,0 %** | 57,01 → 118,23 KiB | 10/10 |
| `WriteBatch` con snapshot, 64 vehículos | 332,9 µs | 463,0 µs | **+39,1 %** | 301,7 → 406,8 KiB | 10/10 |

Las seis diferencias de tiempo son detectables en estas muestras (`p<0,001` según `benchstat`; la tabla conserva una cifra decimal). El caso de publicación asigna aproximadamente **105,1 KiB más por iteración**. No se extrapola a consumo por segundo: ese fixture avanza el reloj de la fuente **un minuto lógico por iteración**, mientras el proyector regula con el reloj real. Por tanto, no representa por sí mismo una sesión a 60 Hz. Las dos filas de cadencia sí simulan ticks a 60 Hz, aunque solo abarcan proyección y JSON.

La proyección pura mejora y no presenta un aumento material de memoria. La regresión aparece al añadir `json.Marshal` y permanece en `WriteBatch` hasta el snapshot retenido. `BenchmarkOverlayV2ByCadence` mide proyección **y** serialización en cada tick; su nombre no representa solo el proyector. La ruta «typed sections» es opcional: requiere `VANTARE_OVERLAY_SECTIONS=1`. El caso canónico y `WriteBatch` representan la ruta predeterminada de serialización. `BenchmarkOverlayPublication64` usa un lote generado y registra demanda, pero **no hace `Subscribe` ni `Pull`**: incluye generación, serialización y retención del snapshot, no la entrega al consumidor ni el frontend. El resumen JSON del script no incluye las dos filas de cadencia porque su parser no reconoce métricas personalizadas entre `ns/op` y `B/op`; las diez muestras están en los archivos `baseline.txt`/`candidate.txt` y `benchstat` sí las analizó. Ninguno de estos tests mide CPU global, GC de una sesión larga, frametime, OBS o acceso al simulador.

## Diagnóstico y contraprueba

En la base anterior, diez pares macOS sobre `186f2179` habían encontrado regresiones del overlay entre 6,5 % y 36,6 %. El perfil de asignaciones apuntó a `encoding/json/v2`; [Go 1.27 documenta el cambio de backend y el opt-out temporal `GOEXPERIMENT=nojsonv2`](https://go.dev/doc/go1.27). La comparación Windows anterior confirma que la diferencia persiste tras incorporar Nightly actual y mide también `WriteBatch` hasta almacenar el snapshot. No conviene extrapolar directamente los porcentajes macOS al ejecutable Windows.

La primera tanda macOS sobre el árbol combinado no se usa para decidir: el host soportaba una carga externa muy elevada (load average superior a 28, con varios procesos Node y navegador consumiendo CPU) y sus tiempos variaron demasiado. La comparación controlada de Windows figura a continuación.

## Contraprueba Windows del backend JSON

El [segundo run de Windows](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35848374505) compiló el mismo código con Go 1.25.0, Go 1.27.1 predeterminado y Go 1.27.1 con `GOEXPERIMENT=nojsonv2`. El commit `1c318406` solo amplió el workflow temporal. Se mantuvieron diez pares alternos por caso y se ejecutaron tests de `overlayv2`, `telemetrytransport` y `app` con el opt-out: **SUCCESS**. Los manifiestos del artefacto confirman que el binario Go 1.27.1 predeterminado es idéntico en ambos contrastes del mismo run. Los porcentajes siguientes comparan **directamente** Go 1.27.1 predeterminado con Go 1.27.1 `nojsonv2` dentro de cada par.

| Caso Windows | Go 1.27.1 predeterminado | Go 1.27.1 `nojsonv2` | Tiempo | Bytes/op | Pares más rápidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Proyección y JSON, cadencia plana | 474,9 µs | 368,8 µs | **−22,3 %** | 668,7 → 670,4 KiB | 10/10 |
| Proyección y JSON, cadencia regulada | 436,2 µs | 274,4 µs | **−37,1 %** | 303,4 → 304,6 KiB | 10/10 |
| JSON canónico, 44 vehículos | 160,2 µs | 106,1 µs | **−33,8 %** | 27,60 → 29,13 KiB | 10/10 |
| JSON por secciones, 44 vehículos | 215,8 µs | 114,6 µs | **−46,9 %** | 118,23 → 57,01 KiB | 10/10 |
| `WriteBatch` con snapshot, 64 vehículos | 491,6 µs | 341,8 µs | **−30,5 %** | 405,5 → 301,7 KiB | 10/10 |

Las cinco mejoras de tiempo tienen `p<0,001` en `benchstat`. Los cuatro casos de proyección **sin JSON** no mostraron una diferencia significativa al cambiar solo el backend, un control negativo coherente con la hipótesis. El opt-out devuelve la memoria asignada por `WriteBatch` al nivel de la toolchain anterior y restaura la velocidad de las rutas JSON medidas. La serialización canónica asigna algo más de memoria con el opt-out, pero gana tiempo; el resultado relevante del `WriteBatch` completo mejora en ambas dimensiones.

La mitigación se fija al compilar las builds Windows nativas, el gate de producto y el workflow de release, y se comprueba en los metadatos del ejecutable (`go version -m`). Los scripts locales de medida y del binario de prueba Orbit se alinean con esa configuración y también verifican el metadato. [Go advierte](https://go.dev/doc/go1.27) que `nojsonv2` puede desaparecer en una versión posterior. Su retirada y la optimización sobre el backend nuevo quedan registradas en [VAN-756](https://app.notion.com/p/3e4e51695c6581238b04f5ce3470e045). El opt-out afecta otras rutas JSON del binario, por lo que los tests y la build Wails del PR final deben pasar con esa configuración exacta.

## Límite y siguiente decisión

Ambos runs son microbenchmarks de runner compartido con fixture generado. Diez pares alternos reducen el sesgo por cambios lentos del entorno, pero no sustituyen una prueba del ejecutable real durante una sesión LMU/OBS. No hay un presupuesto de latencia o asignaciones de producto aprobado en VAN-747. Falta verificar el HEAD final del PR con el opt-out: contratos JSON, suite completa, build Wails y metadatos del ejecutable. Nightly y release continúan sin cambios.
