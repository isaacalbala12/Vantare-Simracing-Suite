# Medición de overlays — VANTA-139 / #1996

## Repetir el banco

Desde `vantare-v2/`, Windows con escritorio activo, sin juego ni compiladores.
La grabación es `native/runtime/tests/golden/lmu47.jsonl.gz`: 3.839 fotos reales
guardadas por el replay de LMU, 47 coches, 60 segundos de reloj de origen. Su
`received_at` está congelado por el generador del golden: **no sirve de reloj**.
El ejemplo usa `origin.source_time`, conserva fotos repetidas y rechaza un reloj
ausente o anterior al inicio. Lee gzip de forma incremental: no mantiene el
corpus completo en la memoria del overlay. No modifica la grabación.

```powershell
$env:CARGO_TARGET_DIR = 'D:/VantareServer/targets/isa-1996-medicion'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --locked -p vantare-ui --example overlay-replay --features paint-stats -j 2
pwsh -NoProfile -File native/scripts/measure-overlays.ps1 -UI "$env:CARGO_TARGET_DIR/debug/examples/overlay-replay.exe" -Recording native/runtime/tests/golden/lmu47.jsonl.gz -Widgets 4 -Phases -Out D:/VantareServer/evidence/isa-1996/mi-pasada
python native/scripts/summarize-overlays.py D:/VantareServer/evidence/isa-1996/mi-pasada
```

Repetir con 1 y 22 widgets y una pasada sin `-Phases` como control del coste de
diagnóstico. Usar carpetas nuevas. El script falla ante compiladores y mantiene
el mutex visual compartido. Cada pasada guarda hashes de ejecutable/grabación,
SHA, CSV de CPU/memoria, logs íntegros y marca de terminación. Un proceso que
falla o un intento interrumpido no produce una medición válida.

El ejemplo es una previsualización de desarrollo: usa el host, entidades,
cadencias, ventanas por monitor y pintores productivos. No instala derechos ni
conecta al núcleo, como Workshop. No mide adquisición, IPC, servicios, licencia,
juego, GPU física, DWM ni OBS. Incluye descompresión y lectura del DTO guardado.
No es un bypass en el ejecutable distribuido. Dev y Release no son comparables:
conservar el mismo perfil y opciones en toda comparación.

## Qué significan los números

CPU de proceso: `TotalProcessorTime`, suma de todos los hilos. Un segundo CPU
por segundo de pared equivale a un núcleo lógico. El intervalo estable excluye
arranque y drenaje. Los endpoints QPC se cruzan con las marcas de `Screen` para
CPU por frame. Son frames de construcción de escena, no presentaciones físicas.
El contador de la fase `present` cuenta llamadas DXGI por separado.

Las fases guardan tiempo transcurrido QPC y ciclos de CPU del hilo. No convertir
ciclos a nanosegundos ni sumar fases anidadas:

- `gpui_layout_request`: construcción del árbol de elementos/layout del monitor;
  incluye los `render` de las vistas que GPUI decide invalidar.
- `gpui_layout_compute`: intervalo entre el retorno del layout raíz y su primer
  prepaint; incluye `compute_layout` de GPUI/Taffy y el trabajo de framework
  inmediatamente alrededor. Es una cota de esa fase, no un perfil de funciones.
- `gpui_prepaint` y `gpui_paint`: recorrido del árbol completo, incluidas las
  primitivas reutilizadas. `paint` mide además las closures de widgets que se
  ejecutan; es una fase anidada.
- `text_layout`: DirectWrite cuando llega al backend; no incluye los aciertos de
  caché que no lo llaman. `layout` es el plan propio de Standings, distinto del
  layout GPUI.
- `gpu_submit` y `present`: trabajo CPU de las API; no tiempo GPU ni latencia
  hasta el monitor.

El wrapper de fases solo existe con `paint-stats`; delega en el elemento raíz
sin añadir nodos, IDs ni cambiar geometría. El control sin `-Phases` utiliza el
mismo ejecutable y desactiva contadores/logs. La memoria es privada y working
set del proceso completo, con el lector de replay incluido.

## Propagación de cambios

El host recibe una `Photo`, verifica la demanda y conserva la última foto.
`LiveScreens::ingest` actualiza visibilidad/sesión de cada entidad y aplica su
cadencia. `Overlay::ingest` proyecta el snapshot y notifica **su propia entidad**
solo cuando cambió la proyección. `Screen` contiene entidades cacheadas: GPUI
reutiliza las primitivas de las que no se invalidaron. Un cambio de anchura de
widget notifica también a `Screen`. Configuración/layout, estado de conexión,
derechos y animaciones tienen sus propios despertares.

`perf notify` identifica widget/época/secuencia de cada notificación por datos;
`perf data_paint` identifica el último snapshot pintado. El resumen distingue
widgets notificados por snapshot cambiado y widgets pintados por snapshot
pintado. GPUI puede coalescer fotos y las animaciones pueden pintar sin una
foto nueva: esos cocientes no son intercambiables. Los contadores `paint` por
widget incluyen las animaciones. Dos Standings son dos entidades, aunque el
contador por tipo las agregue.

## Delta local del backend antes de migrar

Comparación de `vendor/gpui_windows/src` con el checkout íntegro de Zed
`72d28c32c2ba77a579e1c02f984654518552124b/crates/gpui_windows/src`:
6 archivos, +230/−16 líneas. Historial local: `f49d71f4f` (vendorizado inicial)
y `c9a832d70` (#1655/#1675). El delta incluye más que los spans:

| Archivo | Cambio propio que debe conservarse |
| --- | --- |
| `direct_write.rs` | TextLayout; cobertura de glifos grises derivada de ClearType y test de rasterización |
| `directx_renderer.rs` | GpuSubmit/Present; flag de ventana opaca en parámetros del shader |
| `events.rs` | Protocolo de zoom por HWND, escala/DPI y límites del área lógica |
| `gpui_windows.rs` | Uso del crate compartido de diagnóstico |
| `shaders.hlsl` | Cobertura y gamma de texto, alfa cero, saturación de sombras y dither condicionado por opacidad |
| `window.rs` | Estado de zoom/DPI; ventana de captura oculta fuera de monitores sin recolocación por SetWindowPlacement |

`render_to_image` ya existe en el backend publicado: no atribuirlo a nuestro
parche ni duplicarlo. El manifest local añade profiling y fija las dependencias
git del backend. El siguiente paso debe partir del paquete publicado, conservar
su licencia y portar solo este delta.

Verificación del registro (10-nov-2026): `gpui-kit 0.9.1`, `gpui-pre 0.3.12` y
`gpui-fast 0.1.14` existen y declaran Apache-2.0. Los tres tienen como propietario
del registro `huacnlee` (Jason Lee). Kit/Fast enlazan repositorios Longbridge;
Pre declara snapshot Zed `d2a4fb6ded7c470be25d1541281da3882495b65b`.
`gpui-pre-platform` depende del paquete `gpui-pre-windows`, por lo que el patch
git actual no lo sustituye. No asumir compatibilidad binaria entre revisiones.

Fuentes primarias: [Kit](https://crates.io/crates/gpui-kit/0.9.1),
[Pre](https://crates.io/crates/gpui-pre/0.3.12),
[Fast](https://crates.io/crates/gpui-fast/0.1.14); manifests, fuentes publicados
y API `/api/v1/crates/<nombre>/owners`. Los informes de investigadores no se
usan como prueba de compatibilidad ni rendimiento.

## Primera campaña (10-nov-2026, GPUI actual)

Ejecutable `8AD9F6D2C5B0490B6486E479144AB9A99D76071B357875B98B610EBB13DE6345`,
grabación `72A9B69BA34B84FF810452EEC524D8C32380E5C6F24F9BD2A5C7EB5AD7014007`.
Evidencia íntegra en `D:/VantareServer/evidence/isa-1996/baseline-*-*`, con el
ejecutable conservado como `baseline-overlay-replay.exe`. Perfil **dev**;
no son cifras de Release ni del PC de juego. Cada fila es una pasada, no una
mediana ni un presupuesto de producto.
Servidor: Ryzen 5 1500X (8 hilos lógicos), Radeon RX 6600 XT, driver
32.0.21045.5002, Windows 11 build 22631, 1920 × 1080 a 59 Hz declarados por WMI.
Estos datos se guardaron aparte en `baseline-environment.json`.

| Widgets / diagnóstico | CPU estable (s / ≈58,6 s) | CPU ms / frame estable | Memoria privada media (MiB) | Frames totales |
| --- | ---: | ---: | ---: | ---: |
| 1 / activo | 0,015625 | Sin conclusión: casi quieto | 81,45 | 3 |
| 4 / activo | 0,109375 | 0,342 | 94,30 | 330 |
| 4 / apagado | 0,031250 | Contador apagado | 80,80 | Contador apagado |
| 22 / activo | 0,187500 | 0,640 | 83,58 | 303 |

El contador CPU de Windows avanza en pasos de **15,625 ms** en estas pasadas;
los valores pequeños tienen mucha incertidumbre. No concluir una mejora de
producto a partir de estos cocientes ni de una sola pasada. Conservar también
los ciclos crudos por fase y repetir controles al comparar versiones. El
diagnóstico cambia consumo y memoria: no compararlo con un build sin él.

Con cuatro widgets: Standings 6 pintados (dos entidades), radar 330, pedales 2.
Hubo 3.005 notificaciones por datos; GPUI las agrupó en 330 escenas/presentaciones
DXGI. Media de widgets notificados por snapshot cambiado: 1,001; pintados por
snapshot que llegó a pintarse: 1,009. Con 22 widgets: 21.023 notificaciones,
303 escenas, 24 pintados Standings, 2.121 radar y 14 pedales.

En esta grabación las posiciones de Standings y el acelerador están quietos;
velocidad y posiciones espaciales cambian. El caso de un widget demuestra el
reposo después de la ingesta inicial, no rendimiento con texto cambiando cada
frame. No sustituir ese límite por datos sintéticos sin etiquetarlos.

Cuatro widgets, fases completas incluidas las primeras cachés frías:

| Fase | Llamadas | Tiempo transcurrido total (ms) | Ciclos del hilo |
| --- | ---: | ---: | ---: |
| Construir layout | 330 | 28,071 | 99.799.000 |
| Calcular layout y marco inmediato | 330 | 34,204 | 120.736.595 |
| Prepaint | 330 | 62,561 | 219.906.365 |
| Pintar árbol GPUI | 330 | 417,471 | 1.452.811.675 |
| Pintores de widgets (incluidos arriba) | 338 | 202,860 | 702.533.195 |
| DirectWrite (fase anidada) | 21 | 2,987 | 9.481.465 |
| Enviar escena al driver | 330 | 33,279 | 117.587.680 |
| Llamar Present | 330 | 185,705 | 250.305.265 |

En el recorrido del árbol domina el pintado y la reutilización de primitivas,
no la construcción/cálculo de layout. El texto casi no se recalcula en este
corpus; no permite concluir qué costaría una tabla que cambia continuamente.

Caracterización antes de migrar: Nextest UI/domain/profiling, todos los targets
con `paint-stats`, **594/594 PASS**, 6 exclusiones existentes; incluye arquitectura,
proyecciones sin repintado por valores iguales y reloj del lector de replay.
La primera suite en paralelo falló en la hidratación del pipe de
`requested_feed_keeps_unchanged_values_alive_and_receives_source_staleness`
(plazo de 2 s). Pasó aislado y la suite completa pasó con un hilo de test;
no se cambió el test, sus plazos ni la configuración del runner. Los logs
fallidos se conservan. Comparador: 3/3 tests Python PASS. Retirada: 471 huellas PASS.
Fmt y Clippy `-D warnings` PASS (UI/profiling, todos los targets, `paint-stats`).
El primer Clippy señaló dos nombres de método sin backticks en documentación;
se corrigieron y se repitió el check sin cambiar código de comportamiento.
