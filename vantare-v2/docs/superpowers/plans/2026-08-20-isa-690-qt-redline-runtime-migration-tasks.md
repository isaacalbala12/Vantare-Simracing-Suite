# Tasks (SDD · TASKS): runtime Qt Redline — primera ola P0/P1

Fecha: 2026-08-20. Issue madre:
[#690](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/690).
Spec:
`docs/superpowers/specs/2026-08-20-isa-690-qt-redline-runtime-migration-spec.md`.
PLAN:
`docs/superpowers/plans/2026-08-20-isa-690-qt-redline-runtime-migration-plan.md`.
Base de redacción: `origin/nightly@64a33318a8a852c0e089b221357b8e4e8e3c442c`.

Estado SDD: **TASKS aprobadas para ejecución sin una pausa adicional**, según la
instrucción explícita de Isaac del 2026-08-20 tras aprobar PLAN. La autorización
cubre P0/P1 y sus issues hijas; no autoriza promoción a Nightly/Testers, release,
ampliación de alcance ni continuar tras un resultado STOP.

## 1. Reglas de ejecución

- Una tarea = un cambio pequeño y un commit revisable.
- Una issue = una rama y un worktree aislados desde el `origin/nightly` vigente.
- No se edita el worktree histórico y sucio `C:\tmp\vantare-isa370`.
- Se puede leer el spike y rescatar piezas revisadas; nunca copiar builds,
  temporales, rutas absolutas ni evidencia sin custodia.
- Cada comportamiento nuevo empieza con un test RED causal y termina GREEN.
- Cada tarea toca idealmente 1–5 archivos. Assets indivisibles y manifiestos
  explícitos pueden superar ese número, pero no mezclan comportamiento.
- Qt 6.10.2 es la autoridad de build/lint/runtime del candidate.
- No se abre HWND durante tests que declaren ser headless. Los smokes físicos se
  anuncian, ejecutan en serie y cierran con residual cero.
- No se añade dependencia distinta de Qt/fuente ya aprobadas.
- No se toca Telemetry Core, Overlay v2, Wails productivo, Studio, Workshop, OBS,
  settings, packaging de producto ni composition root en esta primera ola.
- GitHub Issue/Project, `docs/current-plan.md` y el handoff se actualizan al
  cerrar cada issue.
- Si T17 declara STOP, no se abren P2+ y no se intenta “arreglar” con una
  arquitectura prohibida.

## 2. Issues de la primera ola

| Issue | Alcance | Dependencia | Resultado |
| --- | --- | --- | --- |
| P0-A | ADR 0009 y autoridad visual | #690 | frontera aceptada |
| P0-B | candidate Qt Redline portable | P0-A | seis diseños, corpus y build autónomo |
| P1 | gate fail-fast de Standings | P0-B | GO o STOP medido |

Solo estas tres issues se crean ahora. P2 (selector) permanece sin issue hasta
que P1 termine GO.

## 3. P0-A — ADR 0009 y autoridad visual

### T01 — Caracterizar la frontera vigente de ADR 0003

**Descripción:** fijar con referencias ejecutables que Studio, Desktop web, OBS
y Workshop comparten `WidgetVisualHost`, y que la excepción Qt solo puede vivir
antes de crear la ventana ingame.

**Aceptación:**

- [x] El test documental localiza el caller productivo de `WidgetVisualHost` en
  Studio/Workshop/OBS/Desktop.
- [x] El test falla si el ADR nuevo afirma que Qt sustituye esos consumidores.
- [x] No cambia código de producto.

**Verificación:**

- [x] `go test ./internal/architecture/...` si existe un gate documental Go; en
  otro caso, el validador documental vigente de ADRs.
- [x] `git diff --check`.

**Dependencias:** ninguna.

**Archivos probables:** test/guard ADR existente y fixture documental, máximo 3.

**Tamaño:** S.

### T02 — Escribir ADR 0009 Proposed

**Descripción:** documentar sidecar Qt x64, selección por perfil, Wails
default/fallback, Overlay v2 y autoridad TSX/CSS.

**Aceptación:**

- [x] Contiene contexto, decisión, consecuencias, alternativas rechazadas,
  rollback y relación explícita con ADR 0003.
- [x] Prohíbe codegen visual, runtime por widget, cgo, shared memory y retirada de
  Wails dentro de #690.
- [x] Declara P1 Standings como gate GO/STOP previo al producto.

**Verificación:**

- [x] Guard T01 verde.
- [x] Links y paths locales válidos.
- [x] `git diff --check`.

**Dependencias:** T01.

**Archivos probables:** `docs/adr/0009-*.md`, índice ADR si existe, handoff.

**Tamaño:** S–M.

### T03 — Aceptar ADR y cerrar P0-A

**Descripción:** revisión completa del diff y registro coherente en GitHub
Project, current-plan y handoff.

**Aceptación:**

- [x] ADR pasa de Proposed a Accepted solo tras revisión de la issue.
- [x] La issue enlaza spec, PLAN, TASKS, commit y checks reales.
- [x] No existe código Qt ni cambio productivo en la rama.

**Verificación:**

- [x] `git diff origin/nightly...HEAD --check`.
- [x] Árbol limpio y solo paths documentales/guard aprobados.

**Dependencias:** T02.

**Archivos probables:** ADR, current-plan, handoff.

**Tamaño:** S.

## Checkpoint P0-A

- [x] ADR 0009 Accepted.
- [x] Issue P0-A cerrada sin producto ni dependencia nueva.
- [x] P0-B puede basarse en el commit revisado de P0-A.

## 4. P0-B — Candidate Qt Redline portable

El candidate se conserva bajo
`tools/benchmarks/isa370-overlay-renderers/candidates/qtquick-redline/**` durante
P0/P1. No se promueve todavía a `native/` ni al instalador de producto.

### T04 — Crear skeleton reproducible y exclusiones de build

**Descripción:** crear el mínimo proyecto CMake Qt 6.10.2 y un helper de fresh
build que descubra una instalación válida sin rutas absolutas compiladas.

**Aceptación:**

- [x] `.gitignore` excluye todo directorio de build, logs y resultados locales.
- [x] El helper configura x64 Release, `/W4 /WX`, CTest y `qmllint`.
- [x] Una copia del árbol en otra ruta configura igual.

**Verificación:**

- [x] `powershell -NoProfile -ExecutionPolicy Bypass -File tools/benchmarks/isa370-overlay-renderers/candidates/qtquick-redline/build-test.ps1 -BuildOnly`.
- [x] El binario no contiene el path del checkout.

**Dependencias:** P0-A.

**Archivos probables:** `.gitignore`, `CMakeLists.txt`, `build-test.ps1`,
`main.cpp`.

**Tamaño:** M.

### T05 — Materializar corpus y manifest Redline

**Descripción:** producir desde las fixtures TS productivas un replay JSONL de
ViewModels completos y un manifest ordenado de 15 escenas.

**Aceptación:**

- [x] 15 escenas y 2466 records, sequence global 0..2465.
- [x] Manifest fija widget, `updateHz`, first/last, count y SHA por slice.
- [x] UTF-8 sin BOM, LF, hashes globales y reproducción determinista.
- [x] El productor falla si una escena no usa el ViewModel productivo.

**Verificación:**

- [x] Test frontend focal del productor y escenas productivas.
- [x] Regenerar deja bytes idénticos y árbol limpio.

**Dependencias:** T04.

**Archivos probables:** productor TS/test, JSONL, manifest y contrato; máximo 5.

**Tamaño:** M.

### T06 — Loader de replay fail-closed

**Descripción:** cargar y validar el corpus portable en C++ sin tolerar drift.

**Aceptación:**

- [x] Rechaza BOM, CRLF, UTF-8 inválido, inventario duplicado/omitido, sequence
  rota, widget/updateHz/cadencia incorrectos y hash distinto.
- [x] Carga las 15 escenas desde assets junto al ejecutable.
- [x] No usa rutas de source tree como fallback silencioso.

**Verificación:**

- [x] QtTest 6.10.2 con positivos 15/15 y todos los negativos.
- [x] Ejecución portable desde directorio temporal.

**Dependencias:** T05.

**Archivos probables:** `replayloader.{h,cpp}`, `redline_replay_test.cpp`, CMake.

**Tamaño:** M.

### T07 — Playback lógico no-loop

**Descripción:** reproducir todos los records vencidos por `logicalMs`, incluso
si el timer llega tarde, y detenerse al final.

**Aceptación:**

- [x] Un avance 0→70→150 ms emite todas las secuencias vencidas en orden.
- [x] Nunca omite, reordena o repite records.
- [x] Lead/tail y fin no-loop son deterministas.

**Verificación:**

- [x] QtTest 6.10.2 con reloj controlado e hitch causal.
- [x] CTest del candidate verde.

**Dependencias:** T06.

**Archivos probables:** `sceneplayback.{h,cpp}`, test focal, CMake.

**Tamaño:** S–M.

### T08 — Modelos keyed de Standings y Relative

**Descripción:** aplicar ViewModels sin `modelReset` para filas retenidas.

**Aceptación:**

- [x] Standings/Relative emiten inserts, moves, removes y dataChanged correctos.
- [x] Una fila retenida no pierde identidad ni delegate por un cambio de dato.
- [x] Los roles coinciden con el replay materializado, sin flags inventados.

**Verificación:**

- [x] QtTest exacto: insert1/move1/remove1/dataChanged≥1/modelReset0.
- [x] Casos intercalados de clase, session-best empatado y gaps null.

**Dependencias:** T06.

**Archivos probables:** `replaymodels.{h,cpp}`, test focal, CMake.

**Tamaño:** M.

### T09 — Modelos tipados de Delta y Pedals

**Descripción:** proyectar los ViewModels pequeños a propiedades QML tipadas.

**Aceptación:**

- [x] Preserva status/statusMessage, referencia Delta, valores de pedales,
  colores y brake peak.
- [x] Ausencia/null no se coacciona a cero semántico.
- [x] Cambios de frame actualizan solo propiedades afectadas.

**Verificación:**

- [x] QtTest 6.10.2 con ready/stale/error/missing y null.

**Dependencias:** T06.

**Archivos probables:** `replaymodels.{h,cpp}`, test focal (mismo ownership que
T08; ejecutar secuencialmente).

**Tamaño:** S.

### T10 — Shell Windows y fuente

**Descripción:** añadir ventana transparente topmost/no-activate/click-through
y cargar Barlow desde assets aprobados.

**Aceptación:**

- [x] Shell compila sin abrir HWND en tests headless.
- [x] Fuente requerida se carga por ID y falla cerrada si falta.
- [x] Assets incluyen OFL, procedencia y hashes; no se copian builds históricos.

**Verificación:**

- [x] Tests unitarios/headless de flags y font registry.
- [x] Smoke físico serial: alpha/click-through/topmost/no-focus; residual cero.

**Dependencias:** T04.

**Archivos probables:** `overlaywindow.{h,cpp}`, `redlinefonts.{h,cpp}` y grupo de
assets de fuente con licencia.

**Tamaño:** M.

### T11 — Tokens y componentes comunes Redline

**Descripción:** portar tokens y primitives compartidas sin semántica de un
widget concreto.

**Aceptación:**

- [x] Tokens, Panel, Status y Slot reflejan materiales Redline aprobados.
- [x] Panel permite variantes compactas sin duplicar el componente.
- [x] Fuente/tamaños/letter spacing son explícitos.

**Verificación:**

- [x] `qmllint --max-warnings 0` Qt 6.10.2.
- [x] QQmlEngine instancia los cuatro componentes.

**Dependencias:** T10.

**Archivos probables:** `qml/theme/RedlineTokens.qml`,
`qml/common/{Panel,Status,Slot}.qml`.

**Tamaño:** M.

### T12 — Standings estático y estados productivos

**Descripción:** integrar shell, clases, filas, leader/player/PIT/session-best,
battle wrapper y estados desde el modelo real.

**Aceptación:**

- [x] Geometría 420 px y grid/headers/materiales coinciden con TSX/CSS.
- [x] Clases intercaladas se agrupan por clase y la clase del player queda al
  final.
- [x] Empates session-best y tiempos `ss.xxx`/`m:ss.xxx` funcionan.
- [x] No existe helper de test que sustituya al adapter/modelo ejecutable.

**Verificación:**

- [x] QtTest 6.10.2 contra `StandingsModel` real.
- [x] Offscreen fixture de leader/player/PIT/best/battle/final-minutes.

**Dependencias:** T08, T11.

**Archivos probables:** `StandingsRedline.qml`, `ClassBlock.qml`,
`StandingsRow.qml`, test focal; Fastest/Battle en T13.

**Tamaño:** M.

### T13 — Motion Standings contractual

**Descripción:** implementar FLIP/enter/ghost/overtake/delta/tire/crown/battle y
la asimetría reduced-motion productiva.

**Aceptación:**

- [x] Duraciones/easings/eventos coinciden con el contrato productivo.
- [x] Battle solo RACE; tire exige PIT→out y cambio de compound; crown vuela de
  owner viejo a nuevo.
- [x] Reduced motion neutraliza solo lo que neutraliza el producto.

**Verificación:**

- [x] QtTest causal prev→next por evento.
- [x] `qmllint` y frame grabs de momentos semánticos.

**Dependencias:** T12.

**Archivos probables:** `StandingsRow.qml`, `Battle.qml`, `FastestGlyph.qml`,
test focal.

**Tamaño:** M.

### T14 — Relative Mirror/Proximity/Traffic

**Descripción:** integrar las tres variantes sobre un modelo y motor causal
compartidos.

**Aceptación:**

- [x] Ready→ready gatea add/move/remove/cross/ghost.
- [x] Player no se vuelve ghost; gaps null permanecen ausentes.
- [x] Crossing budget asigna los tres primeros eventos, no las tres primeras
  posiciones finales.
- [x] Mirror/Proximity/Traffic muestran materiales y estados propios.

**Verificación:**

- [x] QtTest 6.10.2 con `RelativeModel` real y las tres variantes.
- [x] Stress de destrucción/creación sin `QObject::doSetProperty` ni HWND.

**Dependencias:** T08, T11.

**Archivos probables:** dividir en dos commits: core row/budget (≤5) y tres
surfaces/materiales (≤5); tests en commit propio.

**Tamaño:** M por commit.

### T15 — Delta y Pedals visuales/motion

**Descripción:** integrar las dos verticales compactas con Panel/Status comunes.

**Aceptación:**

- [x] Geometría interior descuenta border+padding una vez.
- [x] Delta fill/cross/best y Pedals scaleY/halo/peak son causales.
- [x] Reduced motion detiene y hace snap en el mismo tick.
- [x] Status está antes del panel y no es una tarjeta.

**Verificación:**

- [x] `qmltestrunner` Qt/QTest 6.10.2 y `qmllint` verdes.
- [x] Render offscreen 280×96 y 120×160.

**Dependencias:** T09, T11.

**Archivos probables:** `qml/delta/DeltaRedline.qml`,
`qml/pedals/{PedalRail,PedalsRedline}.qml`, test QML.

**Tamaño:** M.

### T16 — Root integrado y gate portable completo

**Descripción:** registrar todos los QML/modelos en CMake y hacer que Main use
los componentes finales, no placeholders.

**Aceptación:**

- [x] Main puede seleccionar/reproducir cualquiera de las 15 escenas.
- [x] CMake empaqueta replay, manifest, fuente y QML junto a ambos ejecutables.
- [x] Cero QML final queda sin caller o solo cubierto por regex.

**Verificación:**

- [x] Fresh `build-test.ps1`: Release `/W4 /WX`, CTest, QtTest y qmllint.
- [x] Ejecutable portable carga 15/15 escenas.
- [x] Scan binario: cero paths absolutos de checkout.

**Dependencias:** T07–T15.

**Archivos probables:** `CMakeLists.txt`, `main.cpp`, `Main.qml`, test de wiring,
helper build.

**Tamaño:** M.

## Checkpoint P0-B

- [x] Seis diseños y 15 escenas en candidate portable.
- [x] Qt 6.10.2 exacto, fresh build y tests verdes.
- [x] Alpha/click-through/topmost/no-focus físicos PASS.
- [x] Corpus/manifest/fuente/binario custodiados.
- [x] Ningún archivo de producto o packaging modificado.

## 5. P1 — Gate fail-fast de Standings

### T17 — Instrumentación de update y presentación

**Descripción:** medir por evento los tiempos model apply, QML sync y primera
presentación física con clocks correlacionables.

**Aceptación:**

- [x] Trace contiene sequence, scene/frame/logicalMs, QPC y evento.
- [x] No hay logger por frame en camino normal; modo benchmark explícito.
- [x] El medidor no usa DOM ni una métrica autodeclarada por el candidate para
  la evidencia física.

**Verificación:**

- [x] Test del trace con monotonicidad, completitud, bounds y hash.
- [x] Control negativo de evento omitido y clock inválido.

**Dependencias:** P0-B.

**Archivos probables:** `qtmotiontrace.{h,cpp}`, test, wiring benchmark.

**Tamaño:** M.

### T18 — Publicar baseline RED reproducible

**Descripción:** ejecutar el candidate sin optimización adicional y congelar el
fallo exacto de Standings.

**Aceptación:**

- [x] 10 repeticiones por escenario y corpus/hash exactos.
- [x] Reporta p50/p95/max por overtake, full, enter, retirement y stress.
- [x] Demuestra el fallo actual sin reinterpretarlo como PASS.

**Verificación:**

- [x] Agregador independiente reproduce números desde raw.
- [x] Evidencia contiene binario/source/replay/environment hashes.

**Dependencias:** T17.

**Archivos probables:** harness/fixture de benchmark y evidencia versionada; sin
cambio de QML.

**Tamaño:** M.

### T19 — Optimizar el modelo keyed sin cambiar semántica

**Estado 2026-08-21:** STOP sin cambio productivo. Las dos optimizaciones
acotadas ensayadas se revirtieron: una alteraba cadencia/liveness y empeoraba
la cola, y la otra no mostro mejora estable. El modelo queda identico a T18;
no se introduce cache, cola ni semantica nueva para cumplir el gate.

**Descripción:** eliminar resets, copias y señales redundantes demostradas por
T18.

**Aceptación:**

- [ ] Mismas operaciones insert/move/remove/dataChanged que el contrato.
- [ ] Menor tiempo model apply/QML sync medido.
- [ ] No introduce cola, `callLater`, worker o frame omitido.

**Verificación:**

- [ ] RED antes del cambio y GREEN de tests de modelo.
- [ ] Benchmark focal 10 repeticiones; comparación con T18.

**Dependencias:** T18.

**Archivos probables:** `replaymodels.{h,cpp}`, tests de modelo.

**Tamaño:** M.

### T20 — Optimizar bindings/delegates Standings de forma acotada

**Estado 2026-08-21:** STOP medido. El indice lineal de `fca5d9d3` conservo el
contrato y paso Standings 8/8, fresh build, CTest 4/4 y `qmllint`, pero 10 runs
`stress104` dieron p50/p95/max 9,2699/330,7235/1203,6608 ms, peores que T18.
El cambio fue rechazado y revertido en `a36b9a52`; la suite restaurada pasa
7/7. Evidencia: `standings-t20-linear-v1`.

**Descripción:** corregir únicamente bindings o efectos señalados por el
profiler, preservando visual y motion.

**Aceptación:**

- [ ] No recrea árbol, no reduce filas, no elimina materiales/animaciones.
- [ ] Cada cambio tiene una medición antes/después y test visual/motion.
- [ ] Si requiere scene graph C++ custom, la tarea termina STOP sin hacerlo.

**Verificación:**

- [ ] QtTest/qmllint/portable build verdes.
- [ ] Static/motion comparator dentro de thresholds.

**Dependencias:** T19.

**Archivos probables:** máximo 3 QML Standings + test focal.

**Tamaño:** S–M.

### T21 — Calibrar ruido Wails/Wails y comparar Qt/Wails

**Estado 2026-08-21:** OMITIDA por fail-fast. T20 no cumple el presupuesto
interno p95/max (330,72/1203,66 ms frente a 8/16,67 ms). Ejecutar la captura
visual final no puede corregir ese fallo y anadiria coste sin cambiar la
decision.

**Descripción:** ejecutar la evidencia física final con capturador y comparador
canónicos, no una matriz exhaustiva innecesaria.

**Aceptación:**

- [ ] 10 Wails/Wails determinan medoid/ruido.
- [ ] 10 Qt/Wails usan mismos eventos y perfil.
- [ ] Update p95 ≤8 ms, max ≤16,67 ms; onset ±16,67 ms; duración
  `max(16,67 ms,5%)`; trayectoria RMSE≤1/max≤2.
- [ ] Eventos completos, static y matte dentro de spec.

**Verificación:**

- [ ] Artifact canónico se recomputa desde bytes físicos single-handle.
- [ ] Cinco controles negativos causales.
- [ ] Residual de procesos/ventanas/capturadores = 0.

**Dependencias:** T20.

**Archivos probables:** scripts/harness de evidencia y dossier; no product code.

**Tamaño:** M.

### T22 — Decisión GO/STOP y cierre P1

**Estado 2026-08-21:** STOP propuesto por T18/T20, pendiente solo de la revision
independiente exigida por esta tarea. #693 puede cerrarse como gate completado;
#690 no se cierra ni promociona hasta esa revision.

**Descripción:** revisión adversarial de código, evidencia y complejidad.

**Aceptación GO:**

- [ ] Todos los thresholds pasan sin arquitectura prohibida.
- [ ] Candidate sigue portable y visualmente completo.
- [ ] Issue documenta límites de hardware aún reservados para P10.

**Aceptación STOP:**

- [ ] Fallos y raw custodiados.
- [ ] No se crean P2+ ni se integra candidate en producto.
- [ ] Wails continúa sin cambio y #690 se cierra con recomendación STOP.

**Verificación:**

- [ ] Revisión independiente P0/P1/P2/P3.
- [ ] `git diff origin/nightly...HEAD --check`, árbol limpio, GitHub Project y
  handoff coherentes.

**Dependencias:** T21.

**Archivos probables:** dossier, current-plan, handoff y comentarios GitHub.

**Tamaño:** S.

## Checkpoint A — GO/STOP

Este checkpoint sigue siendo obligatorio aunque no haya una pausa SDD adicional:

- **GO:** crear TASKS e issue P2 en una actualización posterior del expediente.
- **STOP:** terminar el programa sin selector, supervisor ni integración de
  producto.

La instrucción “no hace falta que te detengas luego” permite continuar
automáticamente solo si el resultado objetivo de T22 es GO. No permite rebajar
gates ni ejecutar una promoción reservada.

## 6. Checks globales antes de cada commit

- [ ] Rama/worktree/base coinciden con la issue.
- [ ] Solo archivos declarados por la tarea.
- [ ] Test RED causal conservado en evidencia cuando aplica.
- [ ] Tests focales y build aplicables verdes.
- [ ] `git diff --check` verde.
- [ ] Diff completo revisado, incluidos archivos generados/assets.
- [ ] Sin secretos, `.env*`, builds, caches, PIDs o temporales.
- [ ] Handoff/GitHub actualizados si cambia estado material.
- [ ] Sin push, PR, merge, Nightly, Testers o release no autorizados.
