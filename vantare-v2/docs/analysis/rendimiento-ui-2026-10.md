# Rendimiento de Hub GPUI y overlays · octubre de 2026

Issue [#1607](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1607), Plane VANTA-45.
Base: `69fa2d650c85df4184d5821ae4c032201789a1c1`, `origin/nightly` verificado el 14/10/2026.
Rama: `vantareapp/isa-1607-rendimiento-ui`. Documento de trabajo: campaña pendiente.

## Resumen para Isaac (10 líneas)

1. El encargo comprende analizar, medir y corregir sin límite numérico de arreglos.
2. Se mantienen colores, tamaños, textos y comportamiento visual.
3. Tres análisis Muse de solo lectura cubren Hub, overlays y render/layout.
4. El responsable verifica en el código cada sospecha antes de aceptarla.
5. Los overlays ya tienen invalidación por ViewModel, caché de entidades y despertares por animación.
6. El Hub mantiene varios ciclos periódicos aunque sus páginas no estén abiertas.
7. Hay clones de estado resident sin cambios y proyecciones de previews ocultas.
8. Sus costes todavía no están medidos: no se presentan como ganancias demostradas.
9. Las mediciones necesitan el FIN de #1565 posterior al 14/10 a las 00:00 y el lock exclusivo.
10. Se prepara una Release aislada con dos jobs; las correcciones se admitirán con antes/después y gates.

## Condiciones y bloqueo de medición

Leídas `C:/tmp/buzon/REGLAS-NOCHE-1014.md`, incluido «Añadido 00:30».
El último FIN de `1565.md` no incluye fecha y el archivo tenía `LastWriteTime`
13/10/2026 23:16:08 (hora local). Por tanto no prueba el FIN posterior a las
00:00 del 14/10 exigido por las reglas. No se reserva el PC ni se abren apps
hasta cumplirlo. Un FIN antiguo no se convierte en autorización por haber
terminado una build anterior. Incidencia registrada en el buzón de #1607.

No se han leído secretos ni `.env*`. No se opera sobre la instalación ni los
datos de Isaac; tampoco se cierran procesos ajenos. No hay merge, promoción
ni release. Las cifras siguientes permanecen ausentes hasta ejecutar la campaña.

## Tabla de medidas

Cada caso requiere tres tomas válidas y mediana; `—` significa no medido.

| Caso | Toma 1 | Toma 2 | Toma 3 | Mediana | Estado |
|---|---:|---:|---:|---:|---|
| Arranque hasta primera ventana visible (ms) | — | — | — | — | Bloqueado por FIN de #1565 |
| Hub abierto, CPU (% de un núcleo) | — | — | — | — | Pendiente |
| Hub abierto, working set / privada (MiB) | — | — | — | — | Pendiente |
| Hub minimizado, CPU (% de un núcleo) | — | — | — | — | Pendiente |
| Hub minimizado, working set / privada (MiB) | — | — | — | — | Pendiente |
| Cambio de página (ms; página y método explícitos) | — | — | — | — | Pendiente |
| Scroll (CPU y tiempo entre Present) | — | — | — | — | Pendiente |
| Overlays visibles, CPU (% de un núcleo) | — | — | — | — | Pendiente |

No se equipara una ventana creada con contenido listo; tampoco Present con
latencia física ni un ejemplo sintético con LMU/ACC en vivo.

## Herramientas existentes y protocolo

- `native/ui/measure.ps1`: 6 s de calentamiento, 10 s de CPU/GPU/RAM y contadores
  `paint-stats`; fuentes sintéticas quieta/realista/estrés. Su CPU usa un núcleo
  como 100 %, no el total del PC. Necesita tres ejecuciones y conservación de
  resultados crudos; la ruta del EXE debe apuntar a la build de esta rama.
- `native/scripts/measure-cost.ps1` y `.md`: QPC, CPU/ciclos y fases, pero su
  campaña exige LMU real y opera el entorno beta. No ejecutar sin adaptar el
  aislamiento al encargo; no parar la beta real para satisfacer el banco.
- `native/profiling`: fases de proyección, render y backend Windows, activadas
  por `paint-stats` y `VANTARE_PROFILE_PHASES=1`. No es muestreo de funciones.
- `native/hub/reference/tools/capture-window.ps1`: interacción y captura con
  PID/ejecutable esperado y protección de foco. El harness de Testing está
  ligado a `target/debug`; no sirve tal cual para esta Release.

La Release se construye desde esta rama en `C:/tmp/1607-release-target`, mediante
`native/scripts/compilar.ps1`, `CARGO_BUILD_JOBS=2`, `cargo build --release -j 2`,
Hub y overlays con `vantare-services/network,vantare-ui/paint-stats`. El primer
intento omitió `--manifest-path native/Cargo.toml` y falló antes de compilar;
se corrigió la invocación. Log: `C:/tmp/1607-evidence/build-baseline.log`.
No se usa el perfil `prueba` para comparar rendimiento.

Antes de abrir cualquier proceso, reservar atómicamente `pc-medicion.lock`
(issue y hora; respetar locks de menos de dos horas) y comprobar ausencia de
compilaciones concurrentes. Fijar directorios de datos, configuración y logs
en `C:/tmp`, incluidos `LOCALAPPDATA`/`APPDATA` del proceso de prueba,
`VANTARE_NATIVE_DATA_ROOT`, rutas explícitas de Hub y un pipe de prueba.
Guardar SHA, hash de binarios, resolución/DPI y escenario. Abrir páginas con
el harness de PID esperado; comprobar capturas, permisos y scroll reales.
Una página inaccesible se registra como tal: no se atribuye a contenido nunca
abierto. Separar Hub sin conexión, demostración y overlays sintéticos.
Al acabar, cerrar solo los procesos propios y retirar el lock propio.

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

## Arreglos, ganancias y gates

Todavía no hay arreglos de producto ni ganancia antes/después demostrada.
No se modifica producto antes de disponer de una baseline comparable.
Por cada hallazgo aceptado: regresión RED, cambio mínimo, GREEN y gates
aplicables; tres medidas equivalentes antes/después; un commit por arreglo.
Se conserva solo una mejora segura y medible. Los que no se puedan corregir
con seguridad quedan explícitamente pendientes; no se cambia diseño.

Checks documentales ejecutados sobre este árbol:

- `python tools/quality/vantare_quality.py check`: PASS, exit 0.
- `python vantare-v2/native/retirement/verify.py`: PASS, 456 huellas, exit 0.
- `git diff --check`: PASS, exit 0.
- Fmt/check/Clippy/Nextest/lifecycle/telemetría: no ejecutados en este hito
  documental; no cambia Rust, fixtures ni contratos. La Release en preparación
  no sustituye estos gates ni acredita una mejora. Para cada arreglo de producto
  serán obligatorios los gates aplicables antes de aceptar el commit.

## Pendientes y límites de la entrega

- Análisis Muse y revisión propia terminados; validación dinámica pendiente.
- Completar Release y registrar resultado y hashes.
- Obtener señal de #1565 válida, reservar PC y ejecutar toda la campaña.
- Corregir hallazgos aceptados, medir cada cambio y ejecutar gates.
- Actualizar este informe, handoff, issue y PR draft con el SHA/checks reales.
- No hay prueba de navegación manual, scroll, LMU/ACC, OBS ni instalación de Isaac.
