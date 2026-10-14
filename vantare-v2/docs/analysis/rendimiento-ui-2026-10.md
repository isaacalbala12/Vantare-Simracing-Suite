# Rendimiento de Hub GPUI y overlays · octubre de 2026

Issue [#1607](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1607), Plane **VANTA-45**, proyecto Vantare, `area:ui`, sin milestone comprometido.
Rama `vantareapp/isa-1607-rendimiento-ui`, base `69fa2d650c85df4184d5821ae4c032201789a1c1`.
[PR draft #1611](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1611) a nightly; no integración ni release.

## Resumen para Isaac (10 líneas)

1. Se recuperaron los dos commits documentales de T3; no había cambios sin commit.
2. Las 18 sospechas permanecen contrastadas y tienen decisión explícita abajo.
3. Se prepararon cinco correcciones, cada una con regresión RED → GREEN y banco antes/después.
4. Launcher sirve su foto resident por referencia; conserva expiración, errores y decisiones.
5. Las miniaturas conservan su asset entre renders; no se altera documento ni consentimiento.
6. Input Telemetry y Delta Trace comparten muestras entre repintados; nunca saltan fotos/historias.
7. Workshop reutiliza el PNG decodificado cuando sus bytes siguen iguales, con errores y recuperación.
8. Hay 42 tomas de procesos, seis de scroll, dos campañas por operación y tres pares adicionales para Delta.
9. Las tres capturas comparables son idénticas; CPU/RAM/arranque bajo carga variable no prueban ganancia global.
10. Gates locales completos verdes; navegación autenticada, LMU/ACC/OBS y CI final se distinguen de esta prueba.

## Recuperación y condiciones de medida

Leídos AGENTS, issue, buzón y REGLAS-NOCHE-1014 completos, incluidos añadido 00:30 y corrección 01:05.
La corrección explícita elimina el antiguo bloqueo por fecha del FIN de #1565: la build había terminado el 13/10 a las 23:16.
El informe anterior lo trataba como bloqueo; se conserva su evidencia histórica en `299234c8` y `db078ad7`.
Reanudación CLI 14/10, HEAD `db078ad7`, árbol limpio. `origin/nightly` consultado `0807fbd0`; se conserva la base asignada sin merge.
Sin subagentes en CLI y sin diseño nuevo. Los análisis Muse de T3 se contrastaron personalmente; no son mediciones.

#1605 renovó su lock a las 02:42 y lo liberó a las 03:09:31. #1607 creó el suyo con `FileMode.CreateNew` a las **03:09:33**.
Toda la campaña se hizo con ese lock, en serie. Builds Release propias, sin instalación, ajustes ni datos reales de Isaac.
APPDATA, LOCALAPPDATA, datos nativos, paths de Hub y pipes se aislaron en `C:/tmp/1607-evidence`; se retiró `VANTARE_BETA_ROOT` del hijo.
No se leyeron `.env*`, secretos ni datos reales; no se cerraron procesos ajenos, no se tocó USB ni se instaló tooling.

Hub **diagnóstico 0.0.0 sin configuración autenticada**, opción `--demo`. Inicio y Launcher se comprobaron por captura.
Studio muestra catálogo y «Acceso sin verificar»: su lienzo vacío no acredita widgets autorizados en vivo.
Overlays usan `--fuente local`, sintética a 30 Hz. 4/22 repiten Standings/Radar/Pedals; 22 no significa 22 tipos distintos.
El layout de historias tiene Input Telemetry y Delta Trace; la fuente local no aporta delta, por lo que no acredita una historia Delta real.

## Bancos por operación: antes/después

Microbancos Release sobre el camino original instrumentado y el corregido, mismas features y datos, `black_box`, tres tomas y mediana.
Unidad de la tabla: **µs por operación**, no tiempo de frame completo ni latencia física. Las tres tomas originales, confirmación y hashes están en
[`medidas.json`](data/rendimiento-ui-1607/medidas.json). Se conservan todas, incluidos los valores bajo mayor presión del PC.

| Operación | Antes µs | Después µs | Reducción observada |
|---|---:|---:|---:|
| Launcher · 128 perfiles, foto resident sin cambios | 70.311050 | 32.562650 | 53.69% |
| Informe · asset de una miniatura de 24 KiB | 19.526667 | 0.008667 | 99.96% |
| Workshop · misma referencia PNG | 2234.920000 | 115.473333 | 94.83% |
| Input Telemetry · mismas 120 muestras | 2.840620 | 0.008600 | 99.70% |
| Delta Trace · mismas 67 muestras | 0.134040 | 0.008660 | 93.54% |

Los cuatro primeros valores usan la segunda campaña. Delta usa nueve subtomas de tres pares consecutivos, evitando escoger la campaña favorable.
La guardia de datos nuevos incluye generación sintética + ingest + preparación de muestras: el wall time de Delta dio -2.1% en la primera campaña y +32.0% en la segunda.
Por eso se contrastaron tres pares: CPU del proceso **0.343750/0.328125/0.375000 s → 0.312500/0.296875/0.343750 s**, menor en los tres.
Los nueve tiempos de datos nuevos de esos pares tienen mediana **9.7062 → 9.5501 µs**; no se acredita una mejora de ese camino, pero no reproduce una regresión estable.
El ahorro confirmado está en repintar muestras inmutables. Con dato nuevo se invalida la caché y se conserva la historia observada.

La fuente de miniatura del banco mide base64, bytes, hash y creación del asset; **no decode JPEG por frame**: GPUI ya lo cacheaba.
PNG de Workshop sí decodificaba de nuevo al reiniciar/retroceder, no en cada paso normal.

## Procesos Release: tres tomas por caso

6 s de calentamiento + 10 s por toma; working set/privada son medias de diez lecturas, luego mediana de tres tomas.
CPU: 100% equivale a **un núcleo**, no todo el PC. Arranque: creación hasta primer HWND visible, con polling de 10 ms; no contenido listo.
Cada celda es **antes / después**. Datos crudos y PIDs en [`procesos.csv`](data/rendimiento-ui-1607/procesos.csv).

| Caso | Ventana ms | CPU % núcleo | Working set MiB | Privada MiB |
|---|---:|---:|---:|---:|
| hub-home | 697.8 / 447.3 | 2.74 / 2.21 | 104.65 / 104.93 | 120.74 / 120.95 |
| hub-launcher | 325.0 / 279.8 | 3.21 / 2.16 | 98.45 / 98.60 | 115.18 / 115.34 |
| hub-studio | 431.1 / 314.0 | 2.89 / 1.68 | 133.38 / 133.32 | 189.43 / 189.98 |
| hub-minimized | 313.0 / 276.3 | 3.95 / 2.30 | 99.72 / 99.68 | 139.64 / 139.64 |
| overlays-4 | 236.0 / 302.9 | 7.96 / 7.22 | 57.13 / 57.13 | 87.74 / 87.72 |
| overlays-22 | 245.7 / 252.4 | 26.18 / 22.53 | 71.70 / 71.97 | 104.55 / 104.70 |
| overlays-history | 337.5 / 250.1 | 9.79 / 9.00 | 52.57 / 52.62 | 83.45 / 83.44 |

Scroll del catálogo Studio: **6.40 / 4.75%** de un núcleo, tres tomas de 50 ruedas alternas a 200 ms; desplazamiento comprobado por capturas.
No mide input→Present ni frametime. Navegación manual bloqueada por «Acceso sin verificar»: **sin medida**, no se inyecta política ni se falsea un cambio de página.
GPU/Present/latencia física: ausentes. No se mide juego ni OBS.

**Límite causal:** hubo procesos de compilación ajenos y propios durante parte de la campaña (4–15 en los registros), con carga cambiante.
No se atribuyen los cambios de arranque/CPU de esta tabla a las cinco correcciones. El control 4/22 no ejercita las historias y también varió.
Working set y privada apenas cambian; no se afirma una reducción de RAM global. La evidencia de ahorro es el trabajo específico eliminado y sus regresiones.

## Paridad y prueba manual

Capturas físicas propias por PID/ejecutable esperado, a 1280×720 y DPI 96: Inicio, Launcher y catálogo Studio.
Comparación RGBA, umbral 0, sin máscaras: **0/2.764.800 píxeles distintos**, tres PNG antes/después idénticos.
Rutas locales `C:/tmp/1607-evidence/{before,after}-hub-{home,launcher,studio}.png`.
No cambia ningún pintor, color, tamaño, texto, referencia/golden o diseño. No acredita paridad de los 18 widgets en vivo.

El harness externo de navegación tuvo dos errores corregidos (función definida en subscope; variable HOME protegida).
La tercera parada detectó la denegación real de navegación. Los tres fallos se conservan; el scroll se repitió iniciando `--studio`.
No se confunden esos fallos de herramienta con defectos del producto ni se ocultan como tomas válidas.

## Reproducción y artefactos

Binarios base de T3, código nativo `69fa2d65`, preservados en `C:/tmp/1607-evidence/baseline-bins`.
Después en `C:/tmp/1607-release-target/release`; no se comparte target ni se copia su caché. Dos jobs, por `native/scripts/compilar.ps1`.
Build final Release PASS, 1m48s. Comando reproducible desde `vantare-v2`:

```powershell
$env:CARGO_BUILD_JOBS='2'
$env:CARGO_TARGET_DIR='C:/tmp/1607-release-target'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --release -p vantare-hub -p vantare-ui --bin vantare-hub --bin vantare-overlays --features vantare-services/network,paint-stats -j 2
```

| SHA-256 | Hub | Overlays |
|---|---|---|
| Antes | `301297ec24adc152ecbdc1475a6d9390a48f40cb7c19be081dfce5737a2b8fd7` | `d6a3fa6e188c503948fc8ba615232d58ebe6e354f9693bd066f279a6e4a85c4c` |
| Después | `e182c1d8dac84b0e46589d36c1d9f00fc7f827a97b82c6df2a776e87ee38025f` | `44536126c50c74ab3b83898c2e9ed5b4942777be68888691684996598446a29a` |

Pruebas/bancos en `launcher/view.rs`, `testing/screenshots.rs`, `comparison.rs` y `ui/{input_telemetry,delta_trace}/performance_tests.rs`.
Bancos `#[ignore]` se ejecutaron explícitamente bajo lock; no son tests de tiempo que bloqueen CI.
Los ejecutables instrumentados antes/después y sus hashes permanecen en `C:/tmp/1607-evidence/{before,after}-{hub,ui}-tests.exe`.
Scripts externos: `benchmarks.ps1`, `paired-delta.ps1`, `campaign.ps1`, `measure.ps1`, `navigation.ps1` en esa carpeta.
El primer comando de T3 omitió manifest-path y falló antes de compilar; corrección y log original conservados en `build-baseline.log`.

## Causas verificadas en código, por prioridad de investigación

El orden expresa potencial y alcance del trabajo, no un impacto medido ni una
severidad P1/P2 acreditada. Las referencias corresponden a la base indicada.

| Orden | Evidencia | Condición / protección existente | Experimento y arreglo candidato |
|---:|---|---|---|
| 1 | `native/hub/src/shell.rs:125` ingesta Inicio y Studio; `shell/foundations.rs:112` clona la foto y proyecta plantillas; `studio.rs:540` clona la foto | Se hace por cada foto recibida aunque la página sea otra. Studio evita proyección durante drag o ejemplo, pero copia antes. El producto cierra Hub ante el flanco Live permitido | Medir Hub con fuente aislada y páginas distintas. Retener foto actual y activar proyecciones al volver a la página, conservando estados/historias |
| 2 | `native/hub/src/launcher/view.rs:664` devuelve un clon del Status cacheado; `:527` lo consume desde tick cada 100 ms (`:274`) | El parseo está protegido por firma; el clon de vectores/strings permanece en firma idéntica. No equivale a parsear JSON 10 veces/s | Medir reposo con resident fresco de prueba. Servir por referencia o procesar únicamente cambios sin perder expiración/decisiones |
| 3 | `native/hub/src/shell.rs:967` arranca Workshop siempre; `workshop.rs:647` consulta metadata cada 150 ms (`:79`) | Independiente de página visible; solo recarga al cambiar firma. La reproducción y detección de escritura parcial tienen semántica propia | Medir abierto/minimizado y página ajena. Suspender trabajo de autoría oculto y reconciliar al volver, con tests de reproducción/recarga |
| 4 | `native/ui/src/app.rs:1003` busca cada id dentro de `layout.instances` y hace `entry(id.clone())` por widget | En layout productivo, por cada foto admitida; cadencia limita proyección, no estas búsquedas. Para N widgets la búsqueda puede recorrer N² instancias | Medir con layout de 4/18 widgets. Iterar instancias y obtener el widget por id, evitando el clon para cadencias ya existentes |
| 5 | `native/hub/src/shell.rs:897` poll a 100 ms; `settings/mod.rs:574` lee estado beta cada 2 s | No hay notify incondicional por tick. Beta se omite en demo/capture. Permisos, cierre y errores forman parte del contrato | Atribuir CPU a tareas concretas. Mover E/S bloqueante fuera de UI sin ralentizar revocaciones ni cierre |
| 6 | `native/hub/src/testing/editor.rs:494` decodifica base64 y construye `Image` en render de cada captura | GPUI asigna id por hash del contenido y cachea el decode JPEG; lo confirmado es base64, asignación y hash repetidos, no decode JPEG repetido | Cachear `Arc<Image>` por contenido y medir construcción/allocs con 1–3 capturas |
| 7 | `native/hub/src/workshop.rs:547` recrea Overlay y llama `comparison::load_png`; `comparison.rs:48` lee y decodifica PNG | `ingest` ordinario no reconstruye: `restarts_renderer` exige nueva época o retroceso de secuencia (`workshop.rs:134`). No ocurre por cada paso normal | Conservar referencia mientras no cambie widget/archivo; medir cambios de escena y loop, no atribuirlo a cada frame |
| 8 | `native/hub/src/studio/canvas.rs:367` crea Overlay para cada instancia al reconstruir | Reutiliza renderer en cambio solo Look; zoom tiene camino separado. Cambios de geometría y final de gesto pueden reconstruir | Ampliar reutilización sin reset de historias; verificar undo/redo, sesiones, escala y configuración antes/después |
| 9 | `native/hub/src/shell/foundations.rs:688,958` ordena perfiles y copia layout; `home.rs:31` expande/ordena salidas | Caché de thumbnail evita recrear entidades con layout/acceso iguales. Home acota cuatro salidas por serie | Medir render de Inicio con datos de prueba representativos antes de añadir cachés y sus invalidaciones |
| 10 | `native/ui/src/input_telemetry/mod.rs:132` y `delta_trace/mod.rs:247` copian muestras para pintar | Input puede animar; DeltaTrace usa Idle. Standings Vantare ya usa Arc (`standings/mod.rs:718`) | Medir asignaciones por widget y frame; compartir muestras solo si reduce coste sin cambiar historias |

### Verificación propia de las 18 sospechas Muse

Se recibieron los tres análisis Muse Spark 1.3 contributor mediante T3
(`1607-hub-analysis-r1`, `1607-overlays-analysis-r1`, `1607-render-analysis-r1`).
La API resumió inicialmente solo el mensaje de progreso; se recuperó el informe
final leyendo el timeline de cada hijo. Se solicitó `xhigh`, máximo disponible
en el catálogo de este modelo; el `max` recomendado por la skill no figura.
Aunque se indicaron checkouts separados, dos hijos verificaron/leían el worktree
padre heredado por T3; solo lectura, sin cambios propios. No se atribuye ejecución
de pruebas ni medición a sus análisis.

| Muse / sospecha | Verificación del responsable y decisión |
|---|---|
| Hub 1 · poll global | Confirmado `shell.rs:95,897`. Las guardias de beta, licencia y roadmap existen. No suspender todo al minimizar: revocación, errores y cierre siguen siendo obligatorios |
| Hub 2 · arranque | Confirmadas cargas antes de `application.run/open_window` (`shell.rs:1286,1327,1351`). Parte ocurre antes del event loop, no dentro de un callback UI. Primer frame y primera ventana son métricas diferentes. Lazy loading requiere preservar errores de documentos |
| Hub 3 · marco/Adapt | Confirmadas cinco llamadas `shell.rs:734`; los cinco setters comparan igualdad. No hay bucle de notify demostrado. Reducir llamadas necesita medir overhead real |
| Hub 4 · Inicio | Confirmados clones/sort `foundations.rs:688,968`, `home.rs:31`. Thumbnail ya cachea layout/acceso; no recrea N overlays en cada render estable |
| Hub 5 · timers | Workshop/Engineer/Launcher/Studio son periódicos. Calendar inicia reloj al renderizar (`calendar.rs:720`); Services solo mientras hay petición (`services/view.rs:835`). Descartado pausar trigger LMU fuera de Home/Launcher: alteraría automatización |
| Hub 6 · fan-out/avatar | Fan-out confirmado `shell.rs:125`. Avatar procesa base64 solo si cambia perfil (`services/view.rs:1047`) y JPEG se decodifica por sistema de assets GPUI; no es decode completo por foto |
| Overlays 1 · apply | Confirmado notify/reingest `app.rs:883,901`. `Document::poll` compara layout (`layout.rs:344`); tocar fichero idéntico no reproduce apply. Arreglo debe preservar cambios reales de settings, preferencias, visibilidad y Look |
| Overlays 2 · ingest | Confirmada una búsqueda lineal de instancia por widget en `app.rs:1012`, no dos en ese bucle. `demand.covers(required)` antecede al bucle; un filtro extra por widget no es un defecto probado. Considerar iterar instancias antes de añadir cachés duplicadas |
| Overlays 3 · clones frame | Confirmadas copias de muestras `delta_trace/mod.rs:249` e `input_telemetry/mod.rs:141`. Standings Vantare clona Arc; no contabilizar copia profunda. Animación requiere mantener poses/avisos |
| Overlays 4 · texto | Confirmados `fit` y candidatos `efficiency/text.rs:181`; shape cache ya existe (`:140`). No quitar tracking ni sustituir glifos: cambiaría visual. Medir misses y cadenas antes de precomputar anchos dependientes de Window |
| Overlays 5 · pausa | Confirmado clone `app.rs:390`, con guardias de pausa estable/proyección previa (`:381,386`). Pico condicionado, no coste permanente. Conservar semántica de vista abierta durante pausa |
| Overlays 6 · timers | Confirmadas comparaciones antes de refresh; MotionPolicy sí lee/parsea cada 500 ms si `VANTARE_APPEARANCE_FILE` existe (`motion_policy.rs:47`). Rechazado subir permisos/conexión a 1 s: cambia latencia de revocación. Lectura con firma es candidata a medir |
| Render 1 · capturas | Base64/Image por render confirmado `testing/editor.rs:509`; matizado: `Image::from_bytes` solo calcula hash, `ImageDecoder` se cachea por id. Candidato de allocs, no decode JPEG repetido acreditado |
| Render 2 · SVG catálogo | No se acredita ausencia de caché por construir img/svg. En GPUI fijado, `elements/img.rs:542` usa `window.use_asset<ImgResourceLoader>` para ruta estable; SVG usa `paint_svg`. Descartada conclusión de recarga de bytes por nodo; reconstrucción del árbol aún puede medirse |
| Render 3 · Studio rebuild | Confirmado `canvas.rs:367,401`; clonar Entity no copia renderer. Reutilización por geometría puede ser segura con tests de estado/escala, no solo comparación de pixels |
| Render 4 · Adapt | Matizado por guardias de los cinco setters (`studio.rs:231`, `calendar.rs:290`, `testing/view.rs:39`, `launcher/view.rs:153`, `services/view.rs:354`). No cascada incondicional |
| Render 5 · listas | Confirmado árbol completo y trabajo en render (`calendar/beta.rs:630`, `home.rs:31`). Los límites reducen alcance. Virtualización no se adopta sin evidencia y validación de scroll/layout |
| Render 6 · referencia Workshop | Lectura/decode confirmados en rebuild; descartada afirmación de cada step ordinario: `workshop.rs:559` ingesta sin rebuild salvo reinicio/retroceso |

El backend contrastado es la revisión GPUI fijada `72d28c32c2ba77a579e1c02f984654518552124b`,
en el checkout local de Cargo: `platform.rs:2953` (Image por hash),
`elements/img.rs:535` (asset cache). No se necesitan dependencias nuevas.

## Sospechas descartadas o matizadas

- `native/ui/src/app.rs:358`: `Overlay::ingest` notifica si cambia la proyección;
  no notifica incondicionalmente por foto.
- `app.rs:522`: animación por `Wake::Frame`, `At` o `Idle`; no hay timer fijo
  universal de repintado. El timer anterior se cancela/reemplaza (`:268`).
- `app.rs:604`: el host usa `Entity::cached`; clonar un Entity no copia un
  ViewModel completo. No contar esos clones como copias profundas.
- `app.rs:390`: la copia de snapshot corresponde a una pausa inicial; la guarda
  `paused && self.paused` evita repetirla en pausa estable. No es un clon por frame.
- `native/hub/src/services/view.rs:835`: el polling de respuestas se limita a
  una petición ocupada; no es un bucle incondicional en reposo.
- Launcher ya evita parsear su fichero resident sin cambios mediante firma;
  Workshop también evita recargas sin cambios. Reducir timers por intuición
  podría romper decisiones, frescura o reproducción.


## Decisión final sobre las 18 sospechas

| Grupo del análisis | Decisión y motivo |
|---|---|
| Hub 1, Hub 5 · polling/timers | Se corrige la copia resident. Se mantienen cadencias de permisos, errores, cierre, reproducción y trigger LMU; suspenderlas cambia contrato. |
| Hub 2 · arranque | Sin lazy loading. Las tomas están bajo carga variable y no atribuyen una fase de arranque; diferir documentos/errores requiere nueva validación. |
| Hub 3, Render 4 · Adapt | Setters ya comparan igualdad: no hay cascada incondicional demostrada. |
| Hub 4, Render 5 · sort/listas | Sin caché/virtualización nueva: no hay coste aislado demostrado y cambiar árbol/scroll necesita validar layout. |
| Hub 6 · fan-out/avatar | Avatar ya cacheado; ocultar ingesta puede perder historias. No se salta ninguna foto ni se altera la automatización. |
| Overlays 1 · apply | Document compara layout; tocar fichero idéntico no reproduce apply. Cambios reales necesitan ingesta y visibilidad. |
| Overlays 2 · lookup de instancia | Búsqueda N² confirmada; no hay impacto atribuido de frame en layout productivo con IPC/autorización. Queda candidato, no se inventa ahorro global. |
| Overlays 3 · muestras | Dos arreglos independientes, Input y Delta, con datos retenidos, huecos, pérdida y época protegidos. |
| Overlays 4 · texto | Shape cache existente; misses de fit/tracking no atribuidos. No se simplifican glifos ni tracking porque cambiaría visual. |
| Overlays 5 · pausa | Copia inicial protegida por pausa estable; coste permanente descartado. |
| Overlays 6 · apariencia/timers | Lectura/parseo cada 500 ms condicionada a fichero. Sin firma nueva que pueda ocultar cambios de igual mtime/tamaño; permisos/conexión conservan cadencia. |
| Render 1 · miniaturas | Asset preparado por actualización y compartido en render; no se altera preview, payload, consentimiento ni retirada. |
| Render 2 · SVG | GPUI ya cachea assets por ruta estable; no se demuestra relectura de bytes por nodo. |
| Render 3 · rebuild Studio | Reutilizar por geometría necesita proteger undo/redo, escala y estado de widgets con acceso real. No se cambia identidad del renderer en este lote. |
| Render 6 · PNG Workshop | Bytes comparados cada rebuild; reutiliza decode sólo si son idénticos. Cambio real, error y recuperación protegidos. |

No se aceptan como bugs P1/P2 confirmados las sospechas cuyo coste/condición no se pudo reproducir. No se introduce arquitectura ni diseño por intuición.

## Gates y revisión

- RED Release: clon resident, asset de miniatura, muestras Input/Delta y PNG repetido fallaron antes; los guards de historias/errores ya pasaban.
- GREEN: cinco regresiones y guardias de contenido, huecos, pérdida/época, decisiones respondidas, expiración y recuperación PNG.
- `cargo fmt --all -- --check`: PASS.
- `native/gates.ps1 check`, `clippy -- -D warnings`, `test`, `lifecycle`, siempre por cola: PASS.
- Nextest: **1657/1657**, 291.368 s, 12 skipped (incluye cinco bancos ignorados explícitos); sin excluir/debilitar tests para pasar.
- Lifecycle: **18/18**, incluyendo procesos/pipes reales; no es LMU/ACC/OBS físico.
- Quality y retirement: PASS, **456/456** huellas; `git diff --check`: PASS.
- Telemetría separado: omitido, sólo cambian Hub/UI y documentación; no runtime/domain/IPC/testdata ni corpus. Nextest completo no sustituye ese gate si se ampliase alcance.
- Diff completo revisado; no dependencias, workflows, schema, auth/billing ni referencias visuales modificados.

Logs de cada gate y RED/GREEN en `C:/tmp/1607-evidence`. Targets propios: Release externo y `native/target/gates` del worktree.
Las medidas son de diagnóstico; no certifican paquete de distribución, autenticación, Owner/Pro Plus, macOS/DPI distintos o simulador físico.

## Entrega y siguiente paso

Cinco hitos de código separados; SHAs reales en el historial de #1607 y el PR #1611. Push/PR/Plane se verifican al cerrar.
Canal alcanzado: rama de issue y draft a nightly. **Sin merge, promoción, release ni anuncio**.
Revisión del orquestador y prueba de Isaac con Hub autenticado, LMU/ACC/OBS y PC sin builds para atribuir CPU/frametime/input→Present.
Los candidatos pendientes permanecen explícitos; esta entrega no afirma haber resuelto todas las sospechas ni una ganancia global de la suite.
