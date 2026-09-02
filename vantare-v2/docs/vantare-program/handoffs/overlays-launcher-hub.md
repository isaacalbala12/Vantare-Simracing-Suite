# Handoff vivo — Overlay Studio, Launcher y Hub

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Overlay: ADR 0003, `docs/overlays-studio/`, proyecto Linear y sus dos HTML.
- Crystal: `docs/overlay-glassmorphism-pro.html`, solo secciones 01–16.
- Launcher: `docs/launcher-v3-architecture.md`, su plan vigente y Linear.
- Hub: código actual y characterization; los roadmaps históricos no son spec.

## Estado

- **Prioridad operativa 2026-09-02 — cerrar Redline primero (ISA-962):**
  [maestro integral y microcortes](../../superpowers/specs/2026-09-02-huella-minima-plan-maestro.md),
  con [subplan A Redline](../../superpowers/specs/2026-09-02-redline-plan-maestro.md).
  Isaac aclara que quiere planificar TODO el compromiso original: el maestro
  B–J cubre banco, atribución y recortes de memoria/CPU/GPU, UI Hub, efectos
  Redline, Coste e informe, niveles/Automático, HUD swap, composición y V1.
  Maestro aprobado por Isaac para iniciar. Modelos: Luna para mecánico, Terra
  para la mayoría, Sol para hipercomplejo; fast/priority. Isaac ha
  autorizado integrar el candidato en `nightly` una vez superados sus gates;
  no releases, otros canales ni retirada irreversible V1. PR #969 sigue draft.
  Primero reparar el entorno Chromium de CI; después S3 de las cinco
  presentaciones Redline, S4/S5 limitados a su regresión y S2 último, con jugador
  en pista, sin vueltas/Delta y máximo cinco minutos por comprobación.
  Memoria #956 y optimizaciones globales quedan secuenciadas después de Redline,
  no descartadas ni sin plan. R1 iniciado con worker Luna nativo
  `01a062d5-4dda-7ba3-bc0a-48f763e333a2` (Nietzsche), worktree
  `C:\tmp\vantare-redline-ci-r1`, rama `vantareapp/isa-962-redline-ci-r1`, base
  `66ead80f`. Alcance: instalación Chromium anterior a Vitest y regresión de CI;
  sin renderer/LMU. T3 en 3773 no responde; Codex nativo hereda configuración
  `service_tier=priority`. Tras entrega: Terra para review de contrato y calidad.
  Luna entregó `e03ff363` (dos archivos, 25 líneas): instalación obligatoria de
  Chromium antes de Vitest y regresión. RED previo; 45 tests Python y parser
  YAML PASS. Terra `01a062d8-416b-7eb3-9822-1bac4967413e` revisó el diff y
  verificó cumplimiento: APPROVE. Terra de calidad
  `01a062da-1617-7c62-874f-301a3e29440a`: APPROVE sin hallazgos. El orquestador
  inspeccionó el diff y repitió los 45 tests. Integración en rama candidata;
  aún pendiente el CI remoto de ese cambio, no merge a nightly.
  Durante preflight estático apareció R-FIX1: el materializador del catálogo
  copiaba ancho persistido 280 a la expectativa física de Standings, aunque
  el contrato exige normalizarlo a 826. Worker Luna
  `01a062d9-d42d-7451-96ab-ea6ce0caa25f`, worktree
  `C:\tmp\vantare-redline-gate-frame`, base `e03ff363`, sólo catálogo/materializador/
  test. Debe preservar el perfil 280; no cambiar renderer ni derivar la
  expectativa de la medición observada. Entrega `aaa9a491`: test RED (1 PASS /
  1 FAIL), GREEN 2/2, syntax/diff-check PASS. Terra de cumplimiento
  `01a062dc-52b2-7941-bab3-93635c8971fa`: APPROVE y 2/2 verificados;
  Terra de calidad `01a062de-1a30-7c32-adb2-49b202eea34c`: APPROVE sin
  hallazgos. Integrado en candidata; el orquestador repitió los 2/2 tests.
  El conjunto R1/R-FIX1 no cambia runtime. No se ha iniciado prueba física.
  CI previo `33651244585` sobre `66ead80f` terminó FAIL antes de Vitest:
  `TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles`, `store_test.go:801`,
  `recording commit exceeded budget`. No demuestra nada sobre R1 aún no subido;
  no se relajan presupuestos ni se cambia recording dentro del arreglo Chromium.
  Revalidar con el SHA integrado y registrar por separado si reaparece.
  Diagnóstico local del orquestador: ese test aislado, `-count=3`, PASS en
  0,329 s; no reproduce el fallo del runner y no demuestra CI completo verde.
  Conjunto R1/R-FIX1 subido en `9d3971af`, run `33652826996`. Su job de
  promoción estaba verde en modo auditoría pero tenía un error de formulario
  de #962. Se completaron las secciones del contrato sin ampliar alcance.
  El validador estricto descubrió además arrastre del digest anterior; se
  regeneró `roadmap.json` sembrándolo desde la base confiable `659b2c57` y
  conservando `plan.md` candidato. No se cambia el modo auditoría ni se omite
  ningún check. Hace falta CI del SHA documental actualizado.
  Build de preparación `9d3971af` pasó frontend/typecheck y Go con el
  procedimiento autorizado de configuración embebida, sin mostrar valores.
  No se ha validado aún licencia activa ni ejecutado física. Manifiesto local:
  `C:\tmp\vantare-s3-gate\results\r2-preflight-20260902.json`; la siguiente
  preparación debe identificar el nuevo digest, no relabelar el ejecutable.
  **Actualización 2026-09-02 16:22 UTC:** CI `33653238356` del candidato
  `33f6dcfa` terminó FAIL sólo en frontend: 440/441 archivos y 3420/3421 tests
  PASS. Chromium ya se instala y Go pasó. Fallo:
  `PedalsRedline.layout.test.tsx`, saturación de freno, 8 píxeles cambiados
  fuera del well/slot donde exige cero. Focal local sin cambios: 3/3 PASS.
  R-FIX2 iniciado con Terra high/priority `01a062f0-0cd4-7261-98f2-ebf89a5439a0`
  (Euler), rama `vantareapp/isa-962-redline-pedals-ci`, worktree
  `C:\tmp\vantare-redline-pedals-ci`, base `33f6dcfa`. Sólo test y, si se prueba
  causa productiva, CSS/TSX exclusivo de Pedals Redline (máximo 3 archivos).
  Distinguir halo real de máscara subpíxel/entorno; no aumentar tolerancias,
  ocultar el test ni aplicar parche especulativo. Review independiente después.
  Física y merge siguen pendientes. Preparación vigente identificada en
  `C:\tmp\vantare-s3-gate\results\r2-preflight-20260902-33f6dcfa.json`;
  no hay prueba nueva de licencia activa, Wails ni LMU.
  R-FIX2 entregado por Euler en `364f7e2c`: sólo test (+121/-3), suite
  441 archivos/3423 tests, focal 5/5, build/typecheck/lint reportados PASS.
  Control negativo de antigua sombra detecta 20.674 píxeles exteriores.
  Diagnósticos: `C:\tmp\pedals-redline-ci-diagnostics-364f7e2c`. El orquestador
  comprobó que `inset.json` tiene cero diferencias incluso con la máscara
  anterior: los ocho píxeles concretos de CI siguen sin reproducción local.
  No se declara aún acreditada esa atribución. Helper unitario y máscaras
  de los tests de capturas deben compartir cobertura efectiva. Terra
  `01a062fc-2417-72d2-9bb5-ccacaf62a242` revisa cumplimiento sobre ese SHA;
  worker sin editar durante review, aún no integrado ni subido.
  Review Pauli: REQUEST_CHANGES P1, aceptado. `364f7e2c` no se integra.
  El siguiente intento requiere el mismo comparador para positivo/negativo
  y una captura que falle la máscara original; no fabricar exactamente ocho
  píxeles para igualar CI. Ronda local acotada a cinco minutos; si no reproduce,
  entregar sólo diagnósticos manteniendo máscara/aserción original para obtener
  coordenadas/rects del runner. No aceptar fórmula plausible como causalidad
  demostrada ni reiniciar suites grandes sin información nueva.
  Ronda acotada final: desplazar el renderer productivo 0,5 px tampoco
  reproduce (máscara anterior y propuesta: cero diferencias). Euler revirtió
  `364f7e2c` en su rama y entregó `0172d1de`, autónomo, sólo diagnóstico
  (+21 líneas de test). Conserva máscara y aserción cero originales; ante
  fallo registra hasta 16 coordenadas/RGBA, DOMRects, DPR y sombras calculadas.
  Focal 3/3 y typecheck PASS reportados; no se repitieron suite/build/lint
  completos para este cambio observacional. Pauli revisa cumplimiento; después
  procede review de calidad independiente e integración sólo de `0172d1de`.
  No hay arreglo productivo acreditado ni pruebas físicas nuevas.
  Terra Pauli (cumplimiento) y Terra Galileo
  `01a06303-97eb-76e0-9f78-b9540130ab53` (calidad) aprobaron `0172d1de`.
  El orquestador inspeccionó el diff neto, verificó otra vez el focal 3/3 e
  integró sólo el commit diagnóstico como `a0ffe300`. Workers/reviewers
  cerrados; la candidata pasó suite completa (441 archivos/3421 tests, 66,45 s),
  typecheck y lint. La suite emitió `AbortError` de teardown Happy DOM pero
  terminó con todos los tests PASS y código cero; no se oculta ese diagnóstico.
  No se repitió build/Go en este corte de observabilidad exclusiva del test;
  no cambia fuentes productivas, contratos ni el artefacto de runtime.
  El siguiente CI debe conservar el fallo si reaparece y aportar sus
  coordenadas, no se considera resuelta todavía la causa de Pedals.
  **Actualización 2026-09-02 17:01 UTC:** CI `33657242122` sobre `7e0e4d73`
  vuelve a fallar sólo el mismo test (440/441 archivos y 3420/3421 tests PASS).
  El diagnóstico sí aporta evidencia nueva: ocho diferencias en x=328,
  y=369..376, junto al texto inferior; well termina y=276,5886, slot y=389,6615
  y ambos rects tienen right=327,84375, DPR=1. Sombras `none`/`inset`.
  No atribuirlo al halo del well ni ampliar la máscara: x=328 está también
  fuera de la propuesta anterior. JSON literal preservado en
  `C:\tmp\vantare-s3-gate\results\pedals-ci-33657242122.json`.
  R-FIX2b: worker Terra high/priority, worktree exclusivo
  `C:\tmp\vantare-redline-pedals-glyph`, rama
  `vantareapp/isa-962-redline-pedals-glyph`, base `7e0e4d73`.
  Investigar texto/fuentes/raster con reproducción RED: máximo tres archivos
  (layout test, CSS exclusivo Redline y TSX si necesario), sin modificar
  máscara/tolerancia, sin ocultar ni recortar el texto. Primera ronda acotada
  a cinco minutos y checkpoint. Después revisión independiente antes de integrar.
  Física, promoción y resto del programa continúan pendientes; no hay merge.
  Banach terminó NEEDS_CONTEXT, sin cambios: fuente local Roboto-Bold y valor
  contenido; faltaba reproducir la selección fallback. Tras la objeción de
  Isaac a las pausas, el orquestador pausó la tarea programada y asumió el
  bloqueo directamente en el worktree exclusivo, limpio, sin otro writer.
  Reproducción TDD: forzar la alternativa genérica `sans-serif` ya declarada
  por producto selecciona Arial Black a peso 800 y produce exactamente los
  ocho píxeles/RGBA/rects de CI. El valor mide 139,276 px frente a slot135,755.
  RED 4 PASS/1 FAIL; cambio mínimo exclusivo `.ven-pred-slot b`: peso700,
  misma fuente de 11 px, sin clipping ni cambio de máscara. Selecciona Arial
  Bold, valor118,151 px, cero diferencias exteriores. GREEN5/5, más aserción
  explícita del valor completo dentro de su slot. PNG/JSON preservados en
  `C:\tmp\pedals-redline-glyph-red` y `C:\tmp\pedals-redline-glyph-green`;
  el orquestador revisó ambas imágenes. Suite/build/typecheck/lint en ejecución;
  review Terra independiente de cumplimiento iniciada antes de calidad.
  Commit del fix `b3f60b03`: dos archivos (+33/-4). Suite441/3423,
  typecheck/build/lint PASS. Erdos de cumplimiento
  `01a0631c-28ef-73c3-97d2-129d8050920f`: APPROVE sin bloqueantes tras revisar
  diff y reproducción. Revisión Terra de calidad en curso; no integrado todavía.
  [Evidencia y comandos del microcorte](../../analysis/2026-09-02-redline-pedals-font-fallback.md).
  Heisenberg de calidad `01a0631e-a409-7792-8248-b0735416d0d2`: APPROVE sin
  hallazgos, focal5/5 verificado. Orquestador integra el fix y la evidencia en
  la candidata; todos los workers/reviewers cerrados. CI exacto nuevo pendiente.
  La tarea programada permanece PAUSADA por instrucción correctiva de Isaac;
  la continuación se hace activamente en esta sesión. Preparar la nueva build
  configurada y sus hashes en paralelo a CI; todavía no lanzar física ni LMU.
  Las notas históricas inferiores no sustituyen este alcance ni el SHA de cada
  evidencia. No se ha ejecutado ninguna prueba física nueva al escribir el plan.

- **ISA-967 — Pedals Redline contenido en su frame (2026-08-31, rama):** el
  renderer productivo `pedals-redline` ya no hereda el `padding`/`min-height`
  del shell genérico de pedales ni el mínimo intrínseco de sus wells. El
  override queda limitado al selector del template Redline; a 520×420 todos
  los descendientes visibles caben con tolerancia de 0,5 px. Se añadió un
  test Playwright de geometría contra el pipeline productivo completo con
  estados V2 `ready` y `missing`. No modifica `pedals-classic`, `pedals-neo`
  ni otros diseños. La
  validación física S3 con Wails/LMU y licencia activa sobre `cf75af2f` quedó
  `ready` a 520×420: raíz contenida, cero descendientes recortados, cero clips
  internos y cero placas opacas exteriores. Evidencia local:
  `C:\tmp\vantare-s3-gate\results\runs\pedals-20260831-163106\22-pedals-redline`.
  La repetición física posterior detectó que, con freno al 100 %, la sombra
  exterior de saturación se escalaba como un halo blanco alrededor del well.
  `80da8c91` la confinó a un brillo `inset` sin perder la lectura `100%` ni la
  transparencia. La regresión Chromium compara reposo/saturación con
  `deviceScaleFactor: 1`, exige una señal `inset` distinta y cero píxeles
  cambiados fuera del well/slot local; así queda atendida la revisión
  adversarial posterior a `80da8c91`.

- **ISA-958 — autoridad estable Redline en Go (2026-09-01, rama):** Endurance
  Redline consume exclusivamente `FrameV2.relativeSettled`, una ventana
  ordenada con hold de 7 s propiedad de cada `CachedProjector`. La UI rehidrata
  datos vivos sin cambiar filas durante churn; ausencia real o nueva identidad
  de sesión publica de inmediato. El decoder exige como máximo 8+jugador+8,
  sides y orden canónicos, IDs únicos y exactamente un jugador, y el store no
  acepta `sequence` duplicada o regresiva en la misma sesión/epoch. El adapter
  Redline no expone estado de estabilidad frontend; Classic/Minimal/Neo no
  cambian. Integrado en el candidato final Redline: frontend 441 archivos y
  3.418 pruebas PASS, `go test ./...`, build, typecheck implícito, lint y
  `diff --check` PASS. Las revisiones adversariales de la rama de autoridad y
  del contrato de integración no mantienen hallazgos P0/P1. Falta únicamente
  la validación física S3; no hay PR, promoción ni prueba Wails/LMU nueva.

- **Histórico ISA-958 previo a la autoridad Go (2026-08-31, sustituido):** la
  pertenencia mantiene solo VehicleID y exige 900 ms monotónicos; no compara
  posiciones de coches distintos para saltarse el hold. Cada render rehidrata
  los campos de la row Relative actual, elimina ausentes y no avanza con
  secuencias duplicadas/atrasadas aunque declaren un `generatedAt` posterior. Position,
  gap, nombre, clase y última vuelta comparten row/epoch, sin join a Standings.
  El host crea el estado por montaje con un inicializador perezoso de React y
  lo delimita por identidad lógica `perfil:widget.id`, sin depender del objeto
  recreado por responsive layout, refs leídas durante render, mutable global,
  timers ni renders extra. Un cruce ahead/behind debe sostenerse durante el
  hold monotónico de 900 ms: hasta entonces se conserva la última row completa
  aceptada y, al vencer, se publica la nueva row canónica en la siguiente
  cadencia. Motion delimita también epoch/session, por lo que un cambio ready a
  ready no crea ghosts; cada desaparición tiene identidad propia para que un
  timer anterior no elimine una salida posterior del mismo VehicleID.
  TDD de cierre sobre `bff576bc`: RED literal 5 fallos/36 pases; GREEN focal
  acumulado 6 archivos/75 pruebas, typecheck, build, lint focal, changelog,
  generador/check de roadmap y `diff --check` verdes. No sustituye la prueba
  física Wails/LMU, que no se ejecutó en esta rama.
  RED físico aportado por Isaac sobre build bff/#967: run
  `relative-20260831-164218/13-relative-redline-mirror`,
  `invalidRows=false`, `playerChanged=false`, `jumps=4`. Las muestras 8→10 y
  16→19 demuestran dos sustituciones canónicas duplicadas por el ghost de
  salida (5→6→5 filas). El cierre local reserva ghosts solo para huecos netos:
  una sustitución 5→5 conserva una única transición y la entrada sigue usando
  su animación existente. La traducción determinista del RED físico falló
  1/9 antes del cambio y quedó 9/9 después; la repetición física por Isaac
  queda pendiente.
  Un segundo RED físico del candidato combinado `8f2c3dbb`, run
  `relative-20260831-171609/15-relative-redline-traffic`, alternó cinco filas
  con jugador `lmu-slot-0` y cero filas en las muestras 20/22; stderr registró
  `state=live available=true reconnectAttempt=1`, mientras el run que pasó no
  entró en stale/reconnect hasta después del muestreo. El cierre limita toda la
  histéresis a los templates Relative Endurance Redline mediante una señal
  explícita del host: Classic/Minimal/Neo y otros sistemas conservan el
  comportamiento inmediato anterior. Dentro de la misma epoch/session, un
  reconnect puede puentear un frame Relative vacío durante 400 ms; stopped,
  stale o una nueva epoch/session vacían de inmediato.
  La captura física `relative-20260831-172352/15-relative-redline-traffic`
  mostró además el lapnote azul detrás de filas durante churn, con VehicleID
  estables en las 25 muestras. Traffic agrupa aviso y amenaza en un slot y
  desactiva solo el FLIP traslacional mientras ese slot compuesto existe; el
  gate geométrico mueve la amenaza arriba y exige cero intersecciones entre
  lapnote y filas.
  Baseline real nightly `659b2c57`, Spa práctica/boxes: 347 muestras/90 s,
  65 transiciones y 56 composiciones; 262 muestras en la composición estable.
  El probe de repetición debe separar membership canónica de ghosts de motion.
  La revisión NO-GO de `53d725fc` queda corregida localmente en `e84d593a`:
  `error`, `stopped` y `stale` invalidan el estado estable antes de aceptar una
  secuencia reiniciada de la misma sesión; el hold de reconnect vive solo en la
  ViewModel y el test integrado conserva filas a 399 ms y publica cero a
  400/401 ms, sin prolongación por el renderer ni por ghosts sin jugador.
  Traffic excluye del FLIP únicamente el wrapper compuesto de amenaza+lapnote;
  una fila ordinaria sigue animándose. El aislamiento de Classic, Minimal, Neo
  y las superficies compartidas permanece cubierto. RED previo: 3 fallos/27
  pases; GREEN acumulado: 10 archivos/114 pruebas, typecheck, build, ESLint
  focal y `git diff --check` verdes. No se abrió Wails/LMU; S3 física sigue
  pendiente y no hay push, PR, merge ni promoción.
  Último NO-GO P1 corregido localmente en `c80a0769`: Redline ya no
  muta `lastSequence`, `lastRows` ni el hold durante render. Calcula un draft
  inmutable desde la última autoridad publicada y solo lo publica en
  `useLayoutEffect` tras commit, sin programar un segundo render por snapshot.
  La regresión Suspense abandona sequence 2 y demuestra que no contamina la
  recuperación con el mismo sequence. El DOM integrado cubre mirror/Desktop,
  proximity/Studio y traffic/OBS: filas visibles a 399 ms, cero filas y cero
  ghosts a 400/401 ms, recuperación limpia tras error y no-Redline sin
  histéresis. Focal 80/80, typecheck, build (solo warning heredado de chunks
  >500 kB), ESLint focal y `git diff --check` PASS. Sin Wails/LMU, push, PR,
  merge ni promoción.
  Corrección posterior pendiente de revisión: el RED físico
  `relative-20260831-213627/13-relative-redline-mirror` registró nueve cambios
  completos en 24 s sin ghosts, desconexión ni drift. Tras REQUEST_CHANGES, el
  hold de siete segundos sólo conserva slots cuyos VehicleID siguen presentes
  en el `scoped` canónico: si falta uno, acepta inmediatamente la ventana
  candidata completa, sin ghosts, stale ni huecos. Player y filas que no cruzan
  se rehidratan desde el frame actual; el cruce del mismo rival conserva 900 ms.
  RED 3 fallos/39 pases y GREEN 42/42 cubren reemplazo parcial, player actual,
  ausencia de IDs no canónicos y reset session/epoch. Falta repetir la prueba
  física Wails/LMU. Sin push, PR, merge ni promoción.

- **ISA-957 — filas completas y semántica de Standings (2026-08-31, rama):**
  las nueve plantillas Endurance recortan el modelo con
  `floor(altoUtil/altoFila)` antes de renderizar; el caso 520×560 deja 14 de
  18 filas Redline completas y reserva el flujo transitorio de una retirada y
  una batalla (54 px: ghost 30 + box completo 24). Overlay V2 publica `bestLap` y el
  ViewModel muestra en práctica/clasificación la mejor vuelta de la fila y su
  diferencia contra la mejor de sesión; en carrera conserva el gap oficial al
  líder; el shadow compara ese campo y el referente se calcula antes de
  `rowCount`. La regresión de layout monta las nueve plantillas, cuenta sus
  filas DOM y contrasta la geometría declarada en `tokens.css` y la medición
  del flujo aun con `overflow:hidden`; una mutación de 1 px admite una quinta
  fila recortada y falla. Evidencia local: tests frontend focales, paquete Go Overlay V2,
  typecheck y `git diff --check`; no se lanzó Wails ni se tocó CSS.
- **ISA-959 — Track Map Endurance respeta el frame (2026-08-31, rama):**
  `vantareapp/isa-959-track-map-footer-clipping`, base exacta
  `origin/nightly@659b2c57`. La auditoría Wails/LMU real midió un renderer de
  `640×485.625` dentro del frame `640×440`, con el footer completamente fuera.
  La raíz `.ven-track-map` ahora ocupa el alto disponible con `border-box`, sin
  cambiar geometría, tipografía, ViewModel ni la frontera `WidgetVisualHost`.
  Tras el REQUEST_CHANGES adversarial sobre `66d3f541`, la regresión Chromium
  monta `RuntimeWidgetFrame`, `WidgetVisualViewport` y `WidgetVisualHost` para
  Desktop/OBS, y la frontera compartida viewport/host para Studio. Mide frame,
  renderer, SVG, outline y footer por los cuatro lados, dimensiones,
  visibilidad, intersección y orden mapa→footer, con `overflow:visible` para no
  esconder el fallo. Cubre `160×110`, `320×220`, `640×440` y resize libre
  `480×260` en las tres superficies. Contra el CSS anterior falló directamente
  en Desktop `160×110`: bottom `121.40625` frente al máximo `111`; con el fix
  pasa la matriz 12/12. Queda pendiente la revalidación manual en Wails/LMU
  real; no se arrancó la app. Sin push, PR, merge, promoción ni release.

- **ISA-940 — lifecycle a coste cero (2026-08-30):** rama
  `vantareapp/isa-940-lifecycle-coste-cero`, rebasada sobre
  `origin/nightly@9723148f`. El overlay navega a `overlay.html`, deja fuera del
  entry Hub/Supabase/motion y, en niveles 3–5, limita su ventana a la unión de
  widgets con 16 px de margen; edición y niveles 1–2 conservan el monitor
  completo. Wails alpha.98 no expone suspensión WebView2, por lo que el Hub se
  destruye y recrea. El frontend empuja a Go un registro generacional de
  bloqueadores para Studio, Launcher, OAuth, Estrategia y demás borradores
  locales; sin primer snapshot o con cualquier bloqueador se conserva la
  ventana. La pareja efectiva L1/L3 desde el mismo HEAD/exe/dist publicó L3 al
  runtime, dejó el renderer Hub en 0 MiB y midió 405,34 MiB privados: −27,88 %
  frente al baseline de 562 MiB, aceptado por P13 con gate RAM ≥20 %. CDP midió
  389,39 ms para reabrir el Hub destruido. El recorte restante de GPU process y renderer
  del overlay pertenece a [#951](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/951).
  Nightly mantiene como autoridad la política v4 de ISA-943/ISA-947; ISA-940 no
  promociona el nivel 3 y conserva el nivel 1 como valor productivo inicial.

- **ISA-944 — sensor de host y modo Automático F3 (2026-08-30, rama):**
  `vantareapp/isa-944-sensor-automatico` incorpora el sensor Go a 1 Hz para CPU
  total, CPU/RAM del proceso y sus WebView2 propios, detección de LMU en primer
  plano y frametime por PresentMon streaming. La sesión ETW propia usa
  `VantareSensor-<pid>`, limpia al arrancar solo sesiones cuyo PID Vantare ya
  no está vivo y, al cerrar, mata
  y espera el PID exacto de PresentMon entre dos paradas exactas de la sesión;
  `RSXTraceSession` y `VantareHuella-*` quedan fuera. Automático empieza en 3,
  opera entre 2 y 5, sube tras 30 s sanos, baja en dos muestras e impone 60 s
  de histéresis; sin frametime sigue por CPU y publica `reason: unavailable`.
  La política se aplica en caliente, emite `performance:level` solo con Hub
  visible y anuncia cambios mediante texto i18n del Ingeniero. Esta rama
  sustituye el automático provisional descrito por ISA-943; conserva íntegra
  su resolución app+perfil y solo puede bajar la calidad solicitada. Los tests
  Go del alcance pasan, incluido el orden de cierre y la sesión estable
  simulada de diez minutos. En la prueba Wails real de 181 s, 182/183 muestras
  llevaron frametime LMU y el nivel siguió 3→4→5 sin volver a oscilar; CDP
  capturó el snapshot inicial y final de `capabilities.performance`. Vantare y
  su PresentMon desaparecieron al cerrar, su ETW quedó limpia y
  `RSXTraceSession` permaneció activa. Una prueba opt-in de la ruta Go fijó
  además el mensaje OEM de `logman` español cuando la segunda parada encuentra
  la sesión ya ausente. El guion reproducible queda en
  `scripts/bench/isa944-auto-smoke.ps1`; falta la captura sin LMU. PR draft
  **#948** hacia `nightly`; sin merge ni promoción.
  Isaac aceptó el gate 12.2 y revirtió el rollout temporal: Automático es el
  defecto desde #948 y persiste `auto`/3/`default`. El schema v5 migra la
  ausencia de `performance` sin aviso; el sentinel v4 sin procedencia
  `level`/1 migra una sola vez con `migratedFrom: rollout-level-1`, Ajustes lo
  explica mediante `Note` y el primer guardado explícito elimina el marcador.
  Las elecciones explícitas se preservan mediante `source: user`.
  El tope D4 consume directamente la política app+perfil efectiva de #947 e
  incluye `VANTARE_PERF_LEVEL` en builds de diagnóstico; cambios de perfil A→B
  actualizan el límite en caliente y los overrides custom de Hz y efectos se
  clonan al mover el nivel automático.
  `SetHubVisibleProvider` permite reemplazar en caliente la generación que
  decide si se publica `performance:level`; al rebase sobre #942 debe recibir
  el estado de `HubLifecycle`, no conservar el `hubW` inicial.
  El A/A final `sensor-cost-20260830-054516`, desde árbol limpio y nivel 5,
  midió +0,1437 puntos de CPU media, +0,2516 puntos p95 y +4,66 MiB privados;
  registra SHA-256 del ejecutable, 107 muestras sin deriva y cierre con cero
  `vantare-*.exe` y cero sesiones `VantareSensor-*`.

- **ISA-943 — perfil v4 y Ajustes › Rendimiento (2026-08-30):** rama
  `vantareapp/isa-943-perfil-v4-ajustes-rendimiento`, base inicial
  `origin/nightly@ca166b38`. El store acepta perfiles v3 indefinidamente y al
  primer guardado escribe v4, conserva una copia `<perfil>.v3.bak`, descarta
  `behavior.updateHz` y registra valores fast atípicos con ruta/widget/valor.
  La política raíz `inherit|level|custom` se combina en Go con Ajustes; el modo
  automático provisional solo puede bajar calidad. Ajustes ofrece los cinco
  nombres aprobados, Personalizado y Automático deshabilitado, refresca desde
  `performance:level`, muestra los avisos de migración atípica y ofrece
  overrides de Hz por widget con coste `+CPU`. El campo v4 de efectos queda
  reservado para la issue dedicada a las variantes Endurance. Studio
  guarda la política v4, muestra el nivel efectivo y ya no presenta el selector
  legado de frecuencia; los guardados posteriores de layout preservan la
  política. Smoke Wails/CDP propio en 9245: nivel 1→4 y `rafCap` null→30 en el
  mismo target de overlay, con PID propio cerrado y puerto liberado. Evidencia:
  `docs/telemetry-core/evidence/isa-943/`. Quedan para Isaac únicamente el pase
  visual de los controles existentes; las variantes `noBlur`/`flat` y su
  control/coste GPU pertenecen a su issue dedicada. El sensor
  real de Automático sigue fuera de C2. Los guardados de Ajustes y política de
  perfil comparten un coordinador: serializa la persistencia, relee ambos
  estados confirmados y reconcilia esa pareja; Studio protege ruta/documento/
  revisión con un mutex y ambas UIs esperan una confirmación correlacionada.

- **ISA-924 — banco de huella y baseline por hardware (2026-08-28):** PR #929
  integrado en `nightly`; corrección operativa en
  `vantareapp/isa-924-atribucion-renderer-overlay`, base
  `origin/nightly@ca166b38`. Se versionaron la spec autorizada, dos perfiles v3
  reproducibles, banco PowerShell 7, control/probe CDP y agregador de ruido.
  El árbol WebView2 se acota por `--user-data-dir=<exe>\EBWebView`; el renderer
  Hub se fija antes de abrir el overlay. La corrida real con 37 coches reveló
  que el renderer del overlay quedaba sin atribuir; la corrección abre una
  ventana desde `overlay:start-active` hasta target `/` + widgets listos y usa
  `SystemInfo.getProcessInfo` para desempatar por PID y creación más reciente.
  Solo la ambigüedad residual queda `renderer-unassigned`. Las muestras donde
  fallan los contadores GPU se marcan inválidas y no sesgan la media como cero.
  El segundo hallazgo del baseline real fue que una interrupción podía dejar
  `VantareHuella-*` viva y hacer que la siguiente captura produjera cero frames.
  La rama ahora cierra PresentMon + sesión ETW en `finally`, recupera al inicio
  sesiones huérfanas cuyo PID ya no pertenece a Vantare y las registra. Un CSV
  sin frames queda `gameFrametimeValid=false`: frametime no publicable, recursos
  de Vantare todavía válidos. La elevación de PresentMon es opcional mientras el
  CSV v2 resulte válido.
  PresentMon 2.5.1 quedó disponible como binario standalone oficial porque el
  MSI de winget devolvió 1620; usa una sesión ETW propia y nunca
  `--stop_existing_session`. Smoke Wails real A0/A1 PASS: A1 abrió 3 widgets,
  separó ambos renderers, capturó frametime LMU y cerró con
  `Application.Quit()`. La review independiente REQUEST_CHANGES quedó
  corregida: N < 3 no publica; `-Forzar` deja CSV/Markdown no publicables y el
  agregador los rechaza; PresentMon v2 deriva pérdidas de `DisplayedTime=NA`;
  CDP espera Hub y widgets; el árbol se redescubre cada 5 s; unidades MiB y
  `PresentMon.exe`/PATH persistente. El protocolo permite y registra como
  `systemWebView2` solo perfiles bajo `AppData\Local\Packages\Microsoft*`;
  otros Edge/WebView2/Vantare siguen bloqueando. Smoke A1 sin `-Forzar`, 30
  muestras sobre LMU: `publishable=True`, 6 procesos del shell/1 perfil
  permitido, 3/3 widgets, ambos renderers, 3.097 frames, 0 perdidos, cierre
  limpio y cero procesos propios residuales. Es prueba del banco, no baseline:
  quedan pendientes
  180 s × 3 en A0/A1/HubVisible/HubMin, perfil completo, iGPU y VR. Sin merge
  ni promoción.

- **ISA-849 — columnas configurables en Standings Redline (2026-08-25, SDD):**
  rama rebasada el 2026-08-27 sobre `origin/nightly@b1d5b15b` para que solo la plantilla titular
  `standings-redline` respete visibilidad, orden, anchura y alineación sin perder
  sus animaciones. Isaac cerró alcance: Posición y Piloto son anclajes fijos;
  las nueve métricas restantes son flexibles; al activar muchas se ensancha el
  widget y Studio avisa, sin resize automático. Se rechazó un adaptador
  específico por complejidad: la propuesta consume las columnas directamente
  en el TSX/CSS productivo. Review Fable: APROBABLE CON CAMBIOS; Isaac aceptó
  las enmiendas el 2026-08-27. Redline tendrá anchura CSS real sin cambiar la
  geometría de Original/Crystal/otros Endurance; el único campo aditivo será
  `configuredDriverName`; batalla continúa dependiendo de Gap y PIT conserva
  su estado aunque su columna esté oculta. Spec y PLAN/TASKS vivos:
  `docs/superpowers/specs/2026-08-25-standings-redline-columnas-configurables-design.md`.
  PR draft #795/ISA-799 solapa la habilitación de motion en Studio y queda como
  dependencia de integración, no absorbida. Rama
  `vantareapp/isa-849-standings-redline-columnas`. T1 completó el contrato
  aditivo mínimo: V1 y V2 publican `configuredDriverName` sin alterar
  `columns` ni los campos vigentes. Las regresiones fallaron primero y pasan
  17/17. T3a fija además el contrato de viewport: solo Endurance Redline usa
  `layout.w` como anchura base real; Original y otro Endurance conservan 520 px
  escalados. La política ya está conectada en Studio, Desktop/OBS, edición
  in-place y Workshop, incluido el preview DOM imperativo durante resize para
  evitar escalado transitorio. Sus regresiones fallaron primero; gate T3 final
  7 archivos/93 tests. T2 reemplaza la maqueta rígida por anclajes + delta +
  nueve métricas flexibles en orden, con presets/alineación canónicos y el mismo
  renderer para filas vivas y ghosts. Conserva 30 px, keys, clases semánticas y
  datos de motion; focal Redline+contrato 20/20. T4 compuerta solo las señales
  dependientes de celdas: sin Gap no hay batalla/presión; sin Best lap no hay
  hot/corona; sin Neumático no hay reveal. PIT y FLIP/flash/delta/entrada/ghost
  permanecen. Las tres regresiones fallaron primero; gate motion 27/27,
  typecheck y diff-check PASS. T5 adapta únicamente el inspector Redline:
  Posición/Piloto quedan activados y sin check/orden, pero conservan ancho y
  alineación; las métricas móviles saltan ambos anclajes y un aviso i18n indica
  la anchura mínima sin modificar el layout. T6 añade variantes reproducibles
  `standings-minimal` y `standings-all-columns` al Workshop. El primer protocolo
  visual detectó 10 px de overflow real porque la envolvente CSS seguía fija a
  420 px; `width: 100%` lo corrige solo para Redline. Con procedencia limpia
  `c892eca6`, Desktop/OBS/Harness pasan 12/12 capturas; el arranque frío de Vite
  dejó las dos primeras capturas Studio sin root y contaminó su grupo, pero el
  rerun Studio caliente pasa 4/4. Las cuatro superficies quedan así verificadas
  en transparent/solid/grid/context, sin overflow, errores ni contaminación.
  La secuencia productiva
  observó rise/fall, batalla, PIT, hot, reveal de neumático y ghost; las capturas
  mínima (420 px) y completa (1200 px) no muestran recorte horizontal ni
  solape. El preview colaborativo T3 no llegó a adjuntar tab tras tres timeouts,
  así que esto es evidencia Chromium/Workshop, no Wails real. Rebase de
  integración sobre `origin/nightly@741d31bf`; #795 sigue draft y abierto, sin
  absorber su alcance. La revisión propia del 2026-08-28 cubrió corrección,
  simplicidad, arquitectura, seguridad y rendimiento. Detectó y corrigió dos
  hallazgos Required antes del PR: la anchura mínima inline anulaba el
  `width: 100%` al ensanchar y Gap/Mejor vuelta/Neumático no respetaban toda la
  alineación configurada. También simplificó el reorder a una copia de array,
  sin adaptador ni abstracción nueva. Veredicto final: Approve, sin
  Critical/Required pendientes. Sobre el SHA revisado: focal 33/33, suite
  completa 419 archivos/3163 tests, typecheck, build, ESLint focal y protocolo
  visual OBS 4/4 PASS, sin overflow ni errores. El lint global conserva solo el
  `_damage` previo fuera de alcance. Push, PR, CI, merge, promoción y release
  todavía no realizados en este punto del expediente.

- **ISA-842 — autosave e historial productivo de Overlay Studio (2026-08-25,
  PR draft a nightly):** rebasada sobre `origin/nightly@c7d25f94`, la rama
  `vantareapp/isa-842-studio-autosave-undo` convierte cada cambio documental
  confirmado en autosave con debounce de 300 ms. `StudioProvider` mantiene un
  único save en vuelo y coalesce ediciones posteriores sobre la revisión
  confirmada; errores y timeouts dejan el documento recuperable. La ruta
  productiva monta `Ctrl+Z`, `Ctrl+Shift+Z` y `Ctrl+Y`, conserva 100 pasos aunque
  autosave ya haya confirmado el estado y persiste también cada undo/redo. El
  save incluye el archivo ligado a la sesión: cambiar el perfil activo global
  no puede escribir el documento abierto sobre otro perfil. Estado visible:
  pendiente, guardando, guardado automáticamente o reintento. ADR 0093 sustituye
  solo el guardado explícito de ADR 0003. Evidencia fresca tras el rebase:
  frontend completo 389 archivos/2978 tests PASS, focal final de autosave/store
  2 archivos/25 tests PASS, typecheck y build PASS, lint de los 14 TS/TSX
  modificados PASS y
  `go test ./...` PASS. El
  lint global solo conserva el fallo previo `_damage` no usado en
  `car-damage-numbers-view-model-v2.ts`, fuera de alcance. En el harness Orbit
  con Wails mock, X se guardó de 1560 a 1500; `Ctrl+Z` restauró 1560 y
  `Ctrl+Shift+Z` rehizo 1500, ambos con estado `saved`. Falta prueba manual en el
  ejecutable Wails real. Implementación rebasada en `a62c5035` y guard de
  revisión SWR en `569c3dec`; PR **#853** hacia `nightly`, autorizado para merge
  por Isaac el 2026-08-26. Sin promoción a `testers`/`master` ni release.

- **ISA-770 — saltos de widgets en Studio (2026-08-25, PR a nightly):**
  la medición A/B en Wails/WebView2 separó dos caminos. En movimiento reducido,
  el padre de `5a8de7ed` presentó un frame con escena oculta, escala cero,
  widgets `0×0` y un desplazamiento de 698 px; el commit actual dejó los cuatro
  contadores a cero. El Windows medido usa `prefers-reduced-motion: false`, así
  que ese fix no explicaba por sí solo el salto normal. Para ese camino se
  incorporaron los fixes ya validados de la rama de rendimiento: cache SWR del
  documento, convergencia sin rerender si el documento fresco es idéntico,
  bloqueo de fuentes locales antes de montar widgets y geometría del stage
  persistida entre montajes. En el mismo WebView2, entrada fría y vuelta
  Launcher → Studio terminaron con widgets positivos desde su primer frame,
  cero transiciones activas y desplazamiento máximo de 0 px. La ventana Wails y
  el motor WebView2 fueron reales; el frontend se sirvió desde el harness mock
  aislado porque el perfil temporal de Wails no tenía sesión/licencia. El script
  reproducible queda en `frontend/scripts/studio-widget-jump-webview-ab.mjs`.
  Rama `vantareapp/isa-770-onboarding-retencion`, **en PR #844 hacia
  `nightly`** (2026-08-25). Sin release.

- **Inspector de widgets del Studio rehecho (2026-08-25, PR a nightly):** el
  panel lateral tenía tres controles que no hacían lo que aparentaban y una
  columna dominada por seis selectores de color a ancho completo. Corregido:
  «Color de acento» se retira del manifiesto de Vantare Endurance porque ese
  sistema nunca lee `--vo-standings-accent` (en Vantare Original sigue, ahí sí
  está cableado); el desplegable de sistema aplica el diseño por defecto del
  destino en vez de solo filtrar la lista; cada color sobrescrito ofrece
  restablecer al valor del diseño y la sección, «Restablecer apariencia»; el
  selector de diseño avisa cuando hay apariencia por encima. En lo visual, los
  colores pasan a filas compactas agrupadas, `appearance` se separa de `design`
  como acordeón propio, los resúmenes dejan de repetir la cabecera y cada
  sección se explica al dejar el ratón encima. Los pasos de columna dicen
  «Estrecha»/«Izquierda» en vez de `SM`/`MD`/`LG`. Gates PASS: 2978 tests,
  typecheck, lint, auditoría i18n y evidencia visual regenerada. PR #844.
- **Ajustes Orbit: autosave de atajos, descarga de informe y búsqueda
  (2026-08-22, en rama):** tres mejoras de la pantalla Ajustes sobre
  `origin/nightly@4ec98fea`, rama `vantareapp/isa-767-ajustes-orbit-autosave-informe-busqueda`,
  PR draft **#768** hacia `nightly`: (1) los atajos se guardan al grabarlos sin
  botón «Guardar»; (2) botón de descarga del informe de diagnóstico preparado
  (la acción `download` existía testeada pero ninguna pantalla la ofrecía);
  (3) búsqueda de ajustes en la columna de contexto con índice de filas reales,
  matching sin diacríticos y navegación al resultado. Gates locales PASS:
  frontend 2883/2883, typecheck, lint y build. Hallazgos diferidos documentados
  como issues #762 (más hotkeys requieren backend Go), #763 (cerrar a bandeja,
  no hay tray) y #764 (decidir telemetría de producto; no existe analytics).
  Sin integración ni promoción; pendiente review de Isaac.
- **Hub: porte Command Orbit completo en Nightly (2026-08-19).** El hub de
  escritorio migró a la shell **Command Orbit v0.3** (`docs/design/orbit-v03/`):
  integrado en `nightly` con el commit `af2c90d1` (PR #279) en la release
  **v0.1.0.7-nightly.10**. Shell Orbit (rail lateral, columna contextual,
  topbar, paleta `Ctrl K`), kit `frontend/src/ui/orbit/`, tema
  `vantare-orbit.json`, `orbit.tokens.css` y harnesses `visual:orbit-*`.
  **Fase 8 en curso (ISA-368):** retirada del sistema v5 del hub
  (`card-sleek`, `glass-panel`, uppercase de chrome, `ProSidebar`/`V52Shell`) y
  del flag `hub.orbit`; los overlays mantienen su sistema V3. Próximos pasos:
  code review/limpieza del porte y decisión de promoción a `testers`.

- **Fase 2 — inspector flotante in-place (2026-08-16, implementada en rama):**
  extensión del modo edición del overlay con un panel flotante para editar
  content/appearance/behavior del widget seleccionado con datos live.
  Implementada en `vantareapp/isa-402-fase2-inspector-flotante` (6 cortes
  completos): sesión única con `StudioProvider` + `InPlaceProfileClient`
  (load en memoria, save → `overlay:edit-layout:save`, nunca
  `studio:profile:save`), `useInplaceAutosave` por comandos con debounce/
  coalescing, hardening del store (refs de documento/revisión), vista headless
  `WidgetPropertyInspectorView` compartida con el Hub (guard de imports),
  panel fijo a 5 Hz con undo/redo por botones, `LicenseProvider`/`I18nProvider`
  en la rama edit, `recoveryStorage={null}`, sesión pineada a `layout.type`,
  gate P1 de preview imperativa bajo el store PASS. Gates locales: frontend
  388/2863 PASS, Go completo PASS, build/lint focal/diff-check PASS. Spec:
  `docs/superpowers/specs/2026-08-16-overlay-inplace-edit-fase2-inspector-design.md`
  (ACCEPTED); plan: `docs/superpowers/plans/2026-08-16-overlay-inplace-edit-fase2-execution-plan.md`.
  Sin push/PR/promoción; pendiente de revisión de Isaac.
- ISA-365 corrige en rama aislada el Relative: selecciona por distancia física
  circular dos rivales delante y dos detrás, mantiene al jugador centrado y no
  elimina filas cuando LMU carece de gap temporal. En boxes y ante datos no
  comparables muestra `—` neutral; Original, Crystal y Endurance respetan el
  lado físico explícito. Los perfiles antiguos se normalizan a 2+1+2.
  Frontend 376/2750 y build PASS; el gate visual valida todas las capturas de
  Relative al 0 % y conserva dos diferencias ajenas de Delta stale. El lint
  focal propio pasa y el barrido completo del diff solo reproduce el error
  heredado `_absent` de `authoring-fixtures.ts:231`, fuera del cambio. Rama
  nacida sobre `origin/nightly@3eb5dd7b`, sincronizada con
  `nightly@7341e8cd` y publicada en la PR draft #263 hacia `nightly`; sin
  integración, promoción ni release. El CI de la PR, run `31896585676`, pasó
  ruta de promoción, gates bloqueantes y seguridad sobre `839603f5`.
- **Edit mode in-place del overlay (2026-08-16, promovido a `nightly`):** la
  hotkey `Ctrl+Shift+E` (`toggleEditMode`) ya no abre Overlay Studio en el Hub:
  alterna el overlay desktop entre racing y un modo edición de layout in-place
  (seleccionar/mover/redimensionar con snap, guías de alineación y autosave).
  Rama de integración `vantareapp/isa-401-os-12-n01-promover-inplace-edit-a-nightly`;
  spec `docs/superpowers/specs/2026-08-16-overlay-inplace-edit-hotkey-design.md` y
  plan `docs/superpowers/plans/2026-08-16-overlay-inplace-edit-hotkey.md`.
  Gates locales PASS (Go completo, frontend 378/2765, build, lint focal) y CI
  del PR #267 PASS sobre el HEAD exacto. Sin issue de Linear (decisión de
  Isaac 2026-08-16); el nombre `isa-401` cumple el gate de topología.
- ISA-363 está promovida a `nightly` y corrige el parpadeo de widgets durante
  el relevo
  `stale -> live`: Desktop y OBS conservan el último snapshot como `stale`
  hasta recibir la proyección de la nueva revisión, sin publicar el frame
  `disconnected` intermedio. Arranque sin datos, estados reales de conexión o
  parada y proyecciones bloqueadas mantienen el cierre seguro. TDD RED/GREEN,
  focal 4/4, frontend 375 archivos/2736 tests, build, ESLint focal y diff-check
  PASS; el lint global conserva 49 errores y 2 warnings heredados fuera del
  cambio. La rama se sincronizó con `origin/nightly@028c7512`; implementación
  aprobada `ae313e2e`, head final `ac46c3c3` y CI final del PR #260
  `31896118568` en verde. Tras autorización expresa de Isaac, el PR #260 se
  integró por squash en `nightly@7341e8cd`. El gate posterior `31896647826` y
  el roadmap `31896647803` pasaron sobre ese SHA. ISA-367 registra la
  promoción; sin paso a `testers`/`master` ni release.
- ISA-364 está promovida a `nightly` y corrige el listado vacío de
  `Mis perfiles`: los documentos guardados como V3 puro se listan mediante el
  migrador canónico, mientras el
  camino V0/V2 conserva su compatibilidad. El servicio no modifica perfiles ni
  incluye JSON de ajustes o inválidos. TDD RED confirmado; focales de listado
  y paquete `internal/app` PASS. Gates finales: `go test ./...`, frontend
  375/2734, build, `go vet ./internal/app`, fragmento y diff-check PASS; los
  `AbortError` de teardown frontend permanecen heredados y el proceso termina
  con exit 0. El CI final del PR #261, run `31894030661`, pasó topología,
  gates bloqueantes, build Wails y pasos informativos sobre `03a0205b`. La
  rama partió de `origin/nightly@3eb5dd7b`; implementación `f753c172` y merge
  squash del PR #261 en `nightly@22946e6f`, autorizada expresamente por Isaac.
  El gate posterior `31894845365` y el roadmap `31894845385` pasaron sobre el
  SHA integrado. ISA-366 registra la promoción; sin paso a `testers`/`master`
  ni release.
- Escala proporcional de escritorio (rama `vantareapp/isa-343-ui-resp-escala-proporcional-1080-4k`,
  sin Linear por decisión de Isaac; el prefijo isa-343 solo cumple la política de canales del CI y
  no reutiliza la issue descartada; spec `docs/superpowers/specs/2026-08-14-ui-escala-proporcional-1080-a-32-9-4k.md`):
  el overlay (Desktop/OBS) escala por altura desde la base `1920x1080` (QHD≈1.333x, 4K=2x)
  y en ultrawide reparte los widgets hasta un frame máximo 21:9 centrado; los widgets
  full-width (Broadcast Tower) se estiran al frame. El Hub aplica zoom global uniforme
  (`CSS zoom` en `html.hub`, factor `clamp(altura/1080, 1, 2.5)`) y el Studio escala con él
  conservando sus coordenadas internas. Los trabajos previos ISA-337/ISA-343 quedan
  descartados por Isaac y no se reutilizan. Gates: suite frontend completa 378/2768,
  build, lint focal y runner visual `visual:escala-proporcional` (matriz 10 viewports +
  zoom 5 + capturas 5) PASS. Las capturas usan UI real productiva: Hub completo con mock
  Wails (topbar/dock/dashboard) y widgets con diseño oficial sobre el escenario del Studio.
  Isaac revisó y aprobó las capturas. Pendiente: verificación manual en Windows
  (zoom WebView2, DPI 100/125/150) y decisión de Isaac sobre promoción a `nightly`.
- Hub / ISA-358 está promovida a `nightly` mediante PR #245 y squash
  `2909ba73d907eee993fcdec866829973b1bb1474`: la versión/canal del hero procede del runtime, el
  calendario comparte un único estado y no pierde respuestas inmediatas, el
  carrusel usa el snapshot público generado desde Linear con procedencia
  visible y Novedades usa los manifiestos canónicos de release auto-descubiertos.
  Focales 46/46, suite frontend 371/2681, build, lint focal propio y diff-check
  pasan. El preview T3 abrió el servidor correcto pero no pudo producir
  snapshot ni evaluación; queda pendiente la comprobación visual manual. Los
  gates del PR, el gate posterior de Nightly `31817001802` y la regeneración
  del snapshot público `31817001849` pasaron. No hubo promoción a
  `testers`/`master` ni release.
- ISA-357 corrige localmente la batalla animada de Standings Redline: solo
  carrera, una pareja máxima y prioridad por cercanía a la fila del jugador,
  con desempate por intervalo y orden estable. El relevo entre parejas tampoco
  solapa una disolución anterior con la nueva caja. El code review corrigió la
  transición carrera→clasificación, la ausencia de la fila del jugador y la
  frescura de una secuencia rápida A→B→A. TDD focal 21/21, frontend 370
  archivos/2679 tests, build, ESLint focal, design-system 3/3, fragmento y
  diff-check PASS. Persisten dos `AbortError` heredados de teardown con exit 0.
  El Workshop respondió con Vite, pero snapshot y evaluación DOM de T3
  fallaron/agotaron timeout; el servidor temporal quedó cerrado y la inspección
  visual manual continúa pendiente.
  Rama aislada desde `origin/nightly@673283a2`, sincronizada finalmente con
  `nightly@2909ba73` en `a389f8d0`; implementación `71d6b360` y fix de review
  `cf83021a`. La PR #243 se integró por squash en `nightly@fe04a0af`; gates de
  PR y posteriores al merge PASS. Sin promoción a `testers`/`master` ni release.
- ISA-334 (Broadcast Tower horizontal): el fix `04c3ac3c` ya está promovido
  a `nightly`, y se portó a la rama `vantareapp/isa-338-...` (commit `4d69de18`,
  2026-08-14). El widget nace como franja horizontal a todo el ancho real del
  perfil con la altura canónica Crystal de 71px (1872×71), con resize solo
  este/oeste y conformado de layouts legacy a esa franja. El port ajusta la
  altura a 71px (no a los 50px del fix original) para que el renderer Crystal
  no se recorte. Verificado en harness: catálogo 1920×71, frame 1920×71,
  handles E/W, renderer Crystal sin scroll vertical.
- Overlay: el Workshop y sus barandillas fueron promovidos a Nightly mediante
  PR #162; continúa excluido físicamente de Stable. Los arreglos de Studio de
  PR #187, el gate visual de PR #193 y Standings/Relative/Delta Redline de PR
  #191 están también en Nightly. Pedals Redline se entrega en PR draft #195 y
  completa la cobertura visual de los cuatro widgets insignia. El flaky de CI
  ISA-311 quedó corregido y promovido mediante PR #200 a `nightly@54f267b`.
- Delta: ISA-347 está implementada y validada en rama aislada sobre
  `origin/nightly`; añade referencias reales personal/sesión/anterior, unicidad
  por layout y hotkey global configurable. El code review corrigió historial
  nativo, selección canónica legacy y concurrencia del hotkey en `46df1b2`. La
  rama incorporó `nightly@638b470` en `f0e40bd`; la PR #233 pasó los gates y se
  integró por squash en `nightly@5499008`, sin promoción a `testers`/`master` ni
  release.
- Decisión ISA-315: objetivo 2026-08-31 = Overlay Studio V1 estable en
  `testers`. No equivale a `master`, release pública ni suite completa. Existe
  una cohorte aproximada de 10 testers Windows 10/11 con respuesta el mismo
  día. Plan canónico:
  `docs/overlays-studio/overlay-studio-v1-commercial-launch-plan.md`.
- Venta controlada objetivo 2026-09-22..30: Overlay Studio V1 como producto
  principal y módulos no terminados etiquetados Beta/Preview. Depende de gates
  separados de raíz, Billing, artefactos y aprobación; no está autorizada por
  este handoff.
- Launcher: ISA-9 fue validada históricamente; integración real por auditar.
- Hub: ISA-358 integrada en Nightly; ISA-360 registra la promoción y su
  evidencia exacta.
- Base documental ISA-315 rebasada: `nightly@54f267b`.
- PR #198 está autorizado para promoción a `nightly`; `testers`, `master`,
  venta y release permanecen fuera del alcance. Las integraciones en `develop`
  son históricas.

## Overlay Studio

Editor único. Canvas gestiona espacio; inspector/documento configuración;
renderers reciben ViewModels puros.

- multi-select y grupos persistentes sin anidación inicial;
- bloqueo por salida;
- borrador/snapshots de preview; Desktop/OBS cambian al guardar/aplicar;
- diseños oficiales inmutables y duplicables;
- tipo → sistema visual → diseño → configuración;
- Original/Crystal; Crystal gratuito con marca;
- perfiles por simulador con herencia;
- mocks explícitos; stale/missing seguros;
- Desktop puede compartir Studio; OBS puede ser independiente;
- HTML como contrato visual;
- 60 FPS si el hardware lo permite; 10 widgets sin degradación y estrés 20.

Autoridad: `layout-studio-v10.html` para shell/editor y
`docs/overlay-glassmorphism-pro.html` secciones 01–16 para Crystal. Se excluye
V2/reestilizados. El siguiente paso de telemetría es TC-07.

Riesgos:

- **P1:** confundir fondo del showcase con widget en paridad.
- **P1:** divergencia Studio/Desktop/OBS.
- **P2:** baselines obsoletos ocultando regresiones.
- **P2:** cambios locales del checkout `refactor`.

## Overlay Workshop y apertura correcta desde rama/worktree

Workshop tiene un MVP local dev-only en `/workshop`: reutiliza
`WidgetVisualViewport` y `WidgetVisualHost` productivos, con fixtures puros y
query reproducible. Su contrato y microplan están en
`docs/overlays-studio/os-09-overlay-workshop-contract.md`.
ISA-261 establece `frontend/src/overlay/authoring/fixtures/` como única
autoridad para escenarios deterministas; `overlay-harness/harness-fixtures.ts`
solo conserva el re-export temporal. El contrato histórico Crystal (21/18) y
el contrato adicional de Engineer Radio permanecen separados.

### Smoke real de la aplicación que se ha verificado

La ruta que se utilizó correctamente para probar la aplicación completa fue una
build local de producción y **no** `wails3 dev`. Debe ejecutarse desde la raíz
del checkout o worktree que se quiere validar.

1. Confirma primero la fuente que vas a compilar. No continúes desde una rama o
   worktree distinto al que se quiere probar:

   ```powershell
   git branch --show-current
   git rev-parse --short HEAD
   git status --short
   ```

2. Cierra cualquier binario anterior para no confundir la build nueva con una
   instancia antigua:

   ```powershell
   Get-Process vantare -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

3. Indica el `.env.local` autorizado. En el checkout habitual será
   `frontend\.env.local`. Un worktree limpio normalmente no contiene ese archivo
   porque está ignorado por Git; en ese caso apunta `$envFilePath` al archivo
   local autorizado, sin copiarlo al repo, imprimirlo ni mostrar sus valores:

   ```powershell
   $envFilePath = Join-Path $PWD 'frontend\.env.local'
   if (-not (Test-Path -LiteralPath $envFilePath)) {
     throw 'Set $envFilePath to the authorised local frontend/.env.local'
   }

   foreach ($line in Get-Content -LiteralPath $envFilePath) {
     if ($line -notmatch '^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=') {
       continue
     }
     $parts = $line -split '=', 2
     $name = $parts[0].Trim()
     $value = $parts[1].Trim()
     Set-Item -Path "Env:$name" -Value $value
     if ($name -eq 'VITE_SUPABASE_URL') {
       $env:VANTARE_SUPABASE_URL = $value
     }
     if ($name -eq 'VITE_SUPABASE_ANON_KEY') {
       $env:VANTARE_SUPABASE_ANON_KEY = $value
     }
   }

   if (-not $env:VITE_SUPABASE_URL -or
       -not $env:VITE_SUPABASE_ANON_KEY -or
       -not $env:VANTARE_SUPABASE_URL -or
       -not $env:VANTARE_SUPABASE_ANON_KEY) {
     throw 'Missing public Supabase configuration'
   }
   ```

   Es necesario cargar ambos pares: Vite usa `VITE_SUPABASE_*` y el backend Go
   necesita `VANTARE_SUPABASE_*`. Cargar solo uno deja media aplicación sin
   configurar.

4. Compila el frontend, genera la configuración temporal del backend, construye
   el ejecutable y elimina siempre el archivo generado:

   ```powershell
   corepack pnpm --dir frontend build

   powershell -NoProfile -ExecutionPolicy Bypass -File `
     .\tools\generate_supabase_config.ps1 `
     -OutFile .\cmd\vantare\supabase_build.go

   try {
     go build -tags production -trimpath -buildvcs=false `
       -ldflags "-w -s -H windowsgui -X main.version=v$(Get-Content VERSION)" `
       -o .\bin\vantare.exe .\cmd\vantare
   } finally {
     Remove-Item .\cmd\vantare\supabase_build.go -ErrorAction SilentlyContinue
   }
   ```

   `cmd/vantare/supabase_build.go` contiene configuración generada: está
   ignorado por Git, no se abre, no se imprime y nunca se commitea.

5. Abre exclusivamente el ejecutable recién construido:

   ```powershell
   Start-Process -FilePath .\bin\vantare.exe -WorkingDirectory .\bin
   ```

   No abras `vantare.exe` desde la raíz, `build\bin`, un portable antiguo ni una
   build de otro worktree.

6. Smoke mínimo: la app abre; la sesión y el acceso se resuelven; Hub carga; y
   Overlay Studio abre. Registra la rama y SHA probados. Si aparece
   «Configuración incompleta», la build/backend no recibió la configuración
   pública de Supabase o se abrió un binario stale: no es un problema de la
   cuenta ni de su licencia.

### Cuándo usar Wails dev

`powershell -NoProfile -ExecutionPolicy Bypass -File
.\tools\start-wails-dev.ps1` queda como alternativa para depuración interactiva
con HMR. No sustituye al smoke anterior y su resultado no demuestra que
`bin\vantare.exe` se haya construido correctamente.

Autoridades complementarias: `docs/release-beta-operations-runbook.md`
(**Opción A2: build rápida de smoke local, no publicable**; no distribuye
installer, zip ni release) y `docs/tester-build-instructions.md`.

## Launcher

MoTeC i2 Standard 1.1; fijados/recientes/no instaladas/catálogo; ejecutables,
shortcuts, apps Windows y Steam; perfiles con apps/módulos/esperas; continuar o
abortar ante fallo; cerrar solo procesos iniciados por Vantare; perfil LMU
externo opt-in; autostart una vez; módulos con estado; estadísticas locales;
catálogo firmado/cacheado.

Debe auditarse qué commits están realmente integrados antes de nuevo trabajo.

## Hub

Conservar estructura. Solo consistencia visual, estados reales, responsive,
accesibilidad y rendimiento. El selector superior abre módulos, apps, perfiles
y recientes.

## Issues y siguiente acción

- Overlay: revisar/rebasar PR #195, corregir ISA-311, congelar alcance el 14 de
  agosto y preparar RC0 Nightly para el 19 según el plan ISA-315. La promoción
  a Testers requiere issue y aprobación propias; no abrir otro reader LMU.
- Launcher: crear LAU-AUDIT antes de nuevas features.
- Hub: crear HUB-POLISH después de characterization visual.
- Checks: harness real, Playwright, transparencias, responsive, capturas,
  frontend test/build; no regenerar baselines para esconder fallos.

## Última actualización

2026-08-14, ISA-335 corrige en Nightly el rechazo al guardar perfiles con
`vantare-endurance`. La causa era un desfase entre el catálogo frontend ya
promovido y las allowlists Go de persistencia/diseños. La revisión adversarial
eliminó la lista duplicada: ambos consumidores consultan ahora el mismo contrato
tipado. La regresión cubre sistema activo/predeterminado, `systemMemories`,
round-trip en disco y diseños de usuario; los IDs desconocidos siguen fallando
cerrados. Go focal y global, frontend 370/2661 y build pasan. Base inicial
`origin/nightly@8de4f511`; rama
`vantareapp/isa-335-os-bug-guardar-perfiles-rechaza-vantare-endurance-como`.
Fix y regresiones: `074dba6`; centralización revisada: `a4749e9`;
`design-system:check` 3/3 PASS. Isaac autorizó la promoción y el auto-merge
necesario ante integraciones concurrentes; ISA-345 conserva el registro. La PR
#223 se integró por squash en
`nightly@32e9b70907458874d79fd28c5a37ae97cccc436d`. El gate post-integración
`31762153097` pasó ruta, build frontend, Go, frontend, lint de cambios, visuales
y Windows/Wails; el snapshot `31762153118` pasó. El lint global conserva deuda
heredada advisory. Sin promoción a Testers/Master ni release.

2026-08-10, ISA-315 fija el objetivo Stable en Testers para Overlay Studio V1
y la ventana comercial controlada de septiembre. Esta decisión y el estado
superior prevalecen sobre los bloques históricos de OS-09 que siguen debajo.

### ISA-347 — Delta real, único y controlable por hotkey

- Rama/worktree:
  `vantareapp/isa-347-delta-referencias-reales-de-telemetria-instancia-unica-y`
  en `C:\tmp\vantare-isa347\vantare-v2`, desde
  `origin/nightly@7e4eac63fdc3a81278f8815d28e33c8a1293db4a`.
- La telemetría Delta mantiene tres referencias independientes y fail-closed:
  personal observado desde LMU cuando existe, mejor válida de la sesión y
  vuelta anterior válida. Ninguna referencia ausente hereda otra bajo una
  etiqueta falsa.
- Cada layout admite un solo widget `delta`. Catálogo, comandos Studio y
  validadores TS/Go aplican el mismo contrato; los layouts de sesión explícitos
  son alternativos y nunca se renderizan simultáneamente. Los Delta extra de un
  perfil histórico pasan a `preservedWidgets` con su configuración completa,
  de modo que no se renderizan ni se pierden.
- Hotkey `cycleDeltaReference`, configurable en Ajustes y por defecto
  `Ctrl+Shift+D`: Personal → Sesión → Anterior → Personal. Usa el gestor global
  existente, guarda el perfil activo y vuelve a publicar el documento runtime.
  La migración de AppSettings v2→v3 añade el atajo sin sustituir combinaciones
  ya configuradas.
- Evidencia: `go test ./...` PASS; frontend 370 archivos/2673 tests PASS;
  build y ESLint focal PASS. Vitest conserva dos `AbortError` heredados de
  teardown después del resumen con exit 0.
- Estado real: implementación `3a54d34` y fix `46df1b2`, sincronizados con
  `nightly@638b470` mediante `f0e40bd`. Review adversarial: P0=0, P1=3
  corregidos, P2=0 y P3=0. `go test ./... -count=1`, frontend 370/2673, build,
  ESLint focal, vet focal sin deuda nueva y diff-check pasan. La PR #233 pasó
  los gates bloqueantes y se integró por squash en `nightly@5499008` el
  2026-08-14. Sigue pendiente la comprobación manual LMU/Wails; no hubo
  promoción a `testers`, `master` ni release.

### ISA-262 — usar el Workshop local

- Desde este worktree, instalar dependencias desde el lockfile si faltan y abrir
  `corepack pnpm --dir frontend dev`. La URL reproducible es
  `http://localhost:5173/workshop?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default`.
- Los parámetros `widget`, `system`, `design`, `state`, `surface` y `variant`
  se validan fail-closed: una combinación inválida muestra un error y no escoge
  otro diseño. Cambiar los selectores reescribe la URL sin persistir nada.
- No usar esta ruta como preview de licencia, Wails, LMU o perfiles. Vite la
  elimina del build productivo: `main.tsx` no importa estáticamente authoring y
  el módulo sólo se carga con `import.meta.env.DEV`.
- El stage (`data-overlay-workshop-stage`) es chrome de autoría. Para alpha,
  bounds, overflow y paridad se inspecciona el root real
  (`data-overlay-workshop-widget-root`), que contiene el mismo Host/Viewport
  que producción. ISA-263 añade controles y comparativas, no debe duplicar el
  renderer.
- Evidencia ISA-262: Vitest focal 4 archivos / 15 pruebas, lint focal, build
  productivo sin sentinels Workshop, `design-system:check` y Playwright para
  Workshop válido/inválido y Hub sin `console`/`page errors`. La prueba de boot
  ejecuta el script real con `body` ausente, espera un solo listener de
  `DOMContentLoaded` y cubre Hub. Input Telemetry se siembra después del render
  en `useLayoutEffect`, con cleanup por widget; StrictMode preserva historias de
  otras instancias y no duplica la fixture. HMR CSS se aplicó y revirtió sin
  reiniciar el Workshop.

### ISA-263 — controles de autoría

- La URL dev admite además `session`, `location`, `background`, `scale`,
  `preset`, `width`, `height` y `compare`; todos se validan fail-closed y se
  serializan de forma reproducible. `background` solo cambia el stage de CSS:
  nunca entra en el Host, renderer, documento ni crop del widget.
- Los presets 720p, 1080p y 1440p declaran dimensiones de prueba; escala,
  dimensiones, fixture y comparación son efímeros. `Reset controls` restaura
  los defaults canónicos, no el deep-link inicial, sin persistir perfiles.
- Studio, Desktop, OBS y Harness usan la misma función de superficie y el mismo
  `WidgetVisualViewport` + `WidgetVisualHost`. OBS no recibe etiqueta ni chrome
  técnico dentro de su superficie. El root capturable sigue siendo
  `data-overlay-workshop-widget-root`; el stage sigue separado.
- Verificación de cierre ISA-263: Chrome/Playwright cubre deep-link válido e
  inválido, todos los fondos, Studio/Desktop/OBS/Harness, comparación,
  teclado/foco, reset, presets, dimensiones y viewports 1280x720, medio y
  compacto. El documento no produce overflow horizontal; el stage puede hacer
  scroll local para alojar una previsualización grande en compacto. Cero errores
  de consola, página o red relevantes.
- El bootstrap de `/workshop` evita ya cargar Wails: `main.tsx` carga el runtime
  normal dinámicamente desde `AppShell.tsx`. Esto evita la antigua petición
  fallida a `wails/custom.js`; no cambia el runtime normal. HMR CSS se aplicó y
  revirtió sin reiniciar la ruta.
- Las dimensiones y escala se editan como borradores locales: una pareja de
  dimensiones solo entra en URL/root cuando ambas son válidas; una escala
  válida entre 0.25 y 2 conserva valores como `0.3`. Ningún input incompleto o
  fuera de rango escribe una URL no reproducible.
- Evidencia focal final: 6 archivos/29 Vitest PASS, ESLint directo de bootstrap
  y authoring PASS, `design-system:check` PASS, build productivo PASS y
  compile-out sin sentinel `overlay-workshop`, `Overlay Workshop` o `DEV ONLY`
  en los assets. El lint global sigue registrando 30 errores/2 warnings
  heredados fuera del write set.

### ISA-265 — protocolo visual aislado

- Ejecutar `corepack pnpm --dir frontend visual:overlay-workshop -- --widget=delta --system=vantare-crystal --design=delta-crystal-simple --surface=all --viewport=1280x720`. Genera evidencia temporal para cuatro superficies y cuatro escenas sin baselines.
- Stage es chrome de autoría. El root validado es el renderer real: `[data-widget-renderer="<type>"]`, excepto Delta Bar Crystal `.vc-delta-bar`; no usar `data-overlay-workshop-widget-root` como crop.
- Se validan cardinalidad, font readiness, console/page errors, bounds, client/scroll, overflow declarado, alpha, guard y provenance. `root.png` es captura transparente del renderer contractual: su SHA-256 debe coincidir entre las cuatro escenas de cada superficie; si difiere, todos los escenarios de esa superficie quedan `sceneContaminated=true` y fallan. El reporte exige SHA Git real y registra `dirty`; los artefactos están bajo `frontend/.tmp/overlay-workshop-visual-protocol/` y no se versionan.
- Única protrusión: `delta-crystal-simple`, Y ≤13px por su badge compacto; todo exceso adicional falla. El runner imprime progreso, escribe checkpoint y cierra navegador/Vite en `finally`.
- El decode PNG canónico por CDP tiene un coste total aproximado de 5–8 min para la suite 4×4; no se alteran timeouts, helper Crystal, baselines ni umbrales para acortarlo.
- Crystal report-only es un gate independiente: la ejecución limitada a 90s llegó a 7 diseños PASS sin terminar el manifiesto. Nunca tratarla como aprobación total ni tocar baselines; resolver duración en otra issue.

### ISA-291 — autoría directa planificada y aprobada

- Rama: `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`.
  Worktree: `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`.
  Base exacta: ISA-265 `54088b2e5ad25d9a897cb89187ee9684b75c645f`.
- Decisión: editar el TSX/CSS productivo y observarlo por HMR en el mismo
  `WidgetVisualHost`. HTML es referencia visual, no fuente ni compilador. Se
  descartan DSL, scaffolder obligatorio, catálogo paralelo, generated barrel,
  `catalogPosition`, `import.meta.glob` y migración de los 41 diseños.
- Autoridades: spec
  `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
  y plan `docs/superpowers/plans/2026-08-05-overlay-workshop-direct-code-authoring.md`.
- Commits documentales: `41a3f02` (spec), `426f7c6` (plan), `2864846`,
  `57cf199` y `2b18e02` (endurecimiento adversarial).
- Revisión adversarial final: GO. El plan protege drift concurrente, cancelación,
  recovery, HMR sin reload, arranque parcial y cierre de procesos/puerto. El
  revisor no editó archivos ni Linear y no delegó.
- Estado real: planificación cerrada; implementación no iniciada; ningún cambio
  productivo, push, PR o promoción de canal derivado de ISA-291.
- Para continuar en otro chat: leer AGENTS, `docs/agent-workflow.md`, la spec y
  el plan; verificar rama/worktree limpios; comenzar por Task 0. El root
  orquestador asigna cortes, pero cada worker ejecuta inline sin subagentes.

#### Paquete activo de delegación entre chats

Este bloque es la autoridad operativa mientras ISA-291 esté en ejecución. Un
chat nuevo no necesita el historial de Codex si sigue este orden:

1. Abrir `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`.
2. Leer `AGENTS.md`, `docs/agent-workflow.md`, la spec ISA-291 y el plan ISA-291.
3. Verificar rama `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`,
   `git status --short` vacío y que `HEAD` contiene `366308e`.
4. Consultar el ledger inferior y ejecutar únicamente la primera Task pendiente.
5. Actualizar este ledger después de cada worker/review/commit, antes de lanzar
   el siguiente corte.
6. Reflejar el mismo estado en Linear ISA-291. No promover a `nightly`.

Reglas de delegación:

- Solo el orquestador raíz crea workers.
- Un worker recibe una Task o microcorte acotado y tiene prohibido delegar,
  lanzar subagentes, cambiar arquitectura o ampliar archivos.
- El worker debe parar ante cambios ajenos, dependencia nueva, test no entendido,
  contradicción documental o imposibilidad de verificar.
- El orquestador revisa diff, tests, alcance y commit antes de continuar.
- La revisión adversarial final debe ser read-only y ejecutada por un agente
  distinto del implementador, también sin subagentes.

Formato obligatorio del encargo a un worker:

```text
Ejecuta exclusivamente Task <N> del plan ISA-291 en el worktree y rama canónicos.
Lee AGENTS, agent-workflow, spec y plan completos. No lances ni delegues a otros
agentes. Conserva el write set exacto, aplica TDD y comandos del plan, haz staging
por rutas y crea solo el commit indicado. Si aparece una stop condition, detente.
Entrega: rama/HEAD, archivos, tests/checks, omisiones, riesgos, commit y status.
No push, PR, Linear ni promoción de canal salvo instrucción del orquestador.
```

Ledger de ejecución vivo:

| Task | Contenido | Estado | Commit/evidencia | Próxima condición |
|---|---|---|---|---|
| 0 | Preflight reproducible | Completada | Node 24.14.1; pnpm 9.1.0; lock blob `8ecdce49`; sin commit de producto | Task 1 |
| 1 | Guard complementario del Host | Completada | `f9c6617`; Vitest focal 3/3 PASS; revisión de diff sin hallazgos | Task 2 |
| 2 | Invariantes del catálogo | Completada | `c0fff0d`; catálogo 11/11 y contratos acumulados 14/14 PASS | Task 3 |
| 3 | Mutaciones reversibles | Completada | `d2555a4`; Node 8/8 PASS; revisión raíz sin hallazgos | Task 4 |
| 4 | Smoke HMR real | Completada | `1a7bf80` + `a5ed874`; Node 15/15 PASS; smoke ejecutado sobre HEAD limpio | Task 5 |
| 4b | Correcciones P3 de revisión | Completada | `339e81a`; mensaje de guard, carve-out muerto y fragilidad del ancla documentada | Task 5 |
| 5 | Guía de autoría | Completada | `ca978d0`; guía con 4 recetas y contrato OS-09 corregido | Task 6 |
| 6 | Gates acumulativos | Completada (parcial) | suite 2181/2181, lint focal, `design-system:check`, build y compile-out PASS; smoke y protocolo visual omitidos por decisión de Isaac | Task 7 |
| 7 | Handoff y cierre | Completada | docs cerrados | Revisión manual de Isaac |
| 8 | Promoción a nightly | En revisión | Isaac validó al 100 % el 2026-08-05; rama de integración `os-09-n01` con merge `10be06d`; gates combinados 2217/2217, build y compile-out PASS | Merge del PR por Isaac |

Estado actual: implementación autorizada por Isaac el 2026-08-05. Task 0 pasó:
se instalaron dependencias ignoradas con `--frozen-lockfile`, el lockfile real de
la raíz Git conservó el blob `8ecdce49a78adc664e4796f388889fbd41a67c08` y
Vitest 4.1.9, Vite 8.0.16 y Playwright 1.60.0 están disponibles. Task 1 añadió
Workshop al guard de consumidores de `WidgetVisualHost`; la revisión raíz
repitió la caracterización focal con 3/3 PASS y confirmó un diff de un solo
archivo, sin renderer ni excepción paralelos. Task 2 extendió los invariantes a
todos los diseños y parejas realmente registrados: IDs únicos y exactamente un
default por pareja, sin tocar `official-designs.ts`. El test de catálogo pasó
11/11 y ambos contratos juntos 14/14. Task 3 añadió helpers reversibles con
restauración byte a byte, preservación de drift externo, evidencia de recovery,
guard de worktree y cleanup bajo cancelación; la revisión raíz repitió 8/8
tests y confirmó un commit de exactamente dos scripts. Próxima acción exacta:
Task 4.

## ISA-291 — autoría directa (cierre técnico)

1. **Decisión aprobada.** Overlay Workshop es un bucle de autoría sobre el TSX/CSS
   productivo. No hay conversión Workshop→app, catálogo paralelo, DSL ni
   scaffolder obligatorio. Autoridades:
   `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
   (spec), `docs/superpowers/plans/2026-08-05-overlay-workshop-direct-code-authoring.md`
   (plan) y `docs/overlays-studio/overlay-workshop-authoring-guide.md` (guía operativa).
2. **Rama y base.** `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`,
   base ISA-265 en `54088b2e5ad25d9a897cb89187ee9684b75c645f`, worktree
   `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`. Commits de
   implementación: `f9c6617`, `c0fff0d`, `d2555a4`, `1a7bf80`, `a5ed874`, `339e81a`,
   `ca978d0`, más los commits documentales de cada corte.
3. **Arquitectura conservada.** `WidgetVisualHost` → `designSystemRegistry` /
   manifest → renderer productivo. Workshop es el cuarto consumidor del host,
   junto a Studio canvas, runtime y ProfilePreview. Ningún renderer nuevo, host
   alternativo ni segundo catálogo.
4. **Cómo abrir el bucle.** `corepack pnpm --dir frontend dev` y abrir
   `http://localhost:5173/workshop?widget=delta&system=vantare-original&design=delta-original-base&state=ready&surface=studio&variant=default&session=race&location=track&background=grid&scale=1&preset=1080p`.
   El smoke reversible es `corepack pnpm --dir frontend smoke:overlay-workshop-hmr`
   y sus tests unitarios `corepack pnpm --dir frontend test:overlay-workshop-hmr`.
5. **Qué demostró cada gate.** El guard de caracterización bloquea que Workshop
   importe un renderer concreto o esquive el host, nombrando el archivo ofensor.
   Los invariantes de catálogo garantizan IDs únicos y exactamente un default por
   pareja widget/sistema registrada, sin tocar `official-designs.ts`. El smoke
   demuestra que un cambio de TSX y otro de CSS se aplican por HMR sin navegación
   ni reload, y que los bytes se restauran exactamente.
6. **Riesgos restantes.** (a) `TSX_ANCHOR` del smoke depende de dos líneas
   literales de `DeltaOriginal.tsx`; un reformateo lo rompe, aunque falla en seco
   y está documentado en la guía. (b) El smoke exige todo el subárbol `vantare-v2`
   limpio, no solo los dos archivos objetivo. (c) La suite completa emite un
   `AbortError` de teardown de happy-dom que no falla ningún test; es deuda
   heredada, ajena a este corte. (d) Ver el punto 6b: cuestión abierta sobre el
   assert de "sin reload" del smoke.

6b. **Cuestión abierta — el CSS recarga, no hace hot-update.** Verificación manual
   del 2026-08-05 sobre este worktree, con Vite en `localhost:5173` y Delta
   Original en `/workshop`: editar `vantare-original/tokens.css` **sí** aplica el
   cambio al instante sin reiniciar Vite (fondo `rgb(16,16,20)` → `rgb(120,0,180)`,
   y restauración byte a byte verificada por SHA-256), pero lo hace mediante una
   **recarga completa de documento**, no mediante hot-update de CSS. Evidencia: un
   centinela en `window` se perdió en las tres ediciones (un control sin editar
   nada demostró que el contexto persiste normalmente) y la consola registró
   cuatro ciclos `[vite] connecting… connected` sin ningún `[vite] css hot updated`.
   Causa probable: `tokens.css` entra por `@import` desde `src/index.css` y pasa
   por Tailwind v4, que regenera el grafo CSS completo.

   Esto **no invalida el bucle de autoría**, que es la propiedad que interesa: el
   cambio se ve sin reiniciar el servidor. Pero entra en conflicto aparente con
   `assertNoReload` del smoke, que muta ese mismo archivo y afirma verificar la
   ausencia de recarga. El smoke **no se ejecutó** en esta verificación y sus
   condiciones difieren (Chromium propio de Playwright, y el TSX mutado en vuelo
   durante la fase CSS). Acción pendiente para quien retome ISA-280: ejecutar
   `smoke:overlay-workshop-hmr` y resolver la discrepancia. Si el assert resulta
   ser demasiado estricto para este grafo CSS, relajarlo a "el cambio se aplica sin
   reiniciar el servidor" en lugar de debilitar la evidencia.
7. **Fuera de alcance de ISA-291.** Migración de los 41 diseños, canvas
   drag/resize, perfiles, persistencia, lectores LMU, Billing, Wails/SSE y
   baselines visuales. No se cambió ningún píxel ni ningún archivo de producto.
8. **Próxima acción exacta para un chat nuevo.** Isaac completó la verificación
   manual el 2026-08-05, validó ISA-291 al 100 % y autorizó la promoción. El
   trabajo vive ahora en la rama de integración
   `vantareapp/os-09-n01-promocion-overlay-workshop-a-nightly` (creada desde
   `origin/nightly` `fb2c355`, merge `--no-ff` en `10be06d`, sin conflictos), con
   PR abierto hacia `nightly` y **pendiente de que Isaac dé el merge**. Esa
   promoción mueve el Overlay Workshop completo: ISA-260–265 (la herramienta) más
   ISA-291 (sus barandillas y manual); los commits están apilados y no se pueden
   separar. Impacto para usuarios y testers: ninguno, el Workshop está excluido de
   Stable y el compile-out lo confirma. Tras el merge: ISA-280 (OS-09L, gate
   técnico final) y resolver la cuestión abierta del punto 6b.

## ISA-326 / OS-11 — superficie arbitraria y paridad Studio/Desktop/OBS

- **Estado al 2026-08-12:** implementación de Tasks 0–4 completada y revisada;
  gates acumulados de Task 5 ejecutados. Queda la aceptación manual de Isaac en
  hardware Windows multimonitor antes de cualquier promoción.
- **Rama/worktree:**
  `vantareapp/isa-326-os-11-superficie-arbitraria-y-paridad-de-resolucion` en
  `C:\tmp\vantare-isa326\vantare-v2`, desde
  `origin/nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`.
- **Hallazgo raíz:** el selector actual solo altera el zoom calculado. Documento,
  validación, drag/resize, Desktop y OBS siguen ligados a 1920×1080 y mantienen
  fórmulas/orígenes distintos.
- **Decisión vigente:** `layoutViewport {width,height}` opcional y
  retrocompatible en V3; ausencia = 1920×1080. Unidades CSS/DIP. Transformación
  pura `contain` compartida, centrada y sin deformación. Cualquier resolución es
  válida; los presets solo son atajos.
- **Política entre proporciones:** sin reflow implícito. Si documento y salida no
  coinciden, se preserva la proporción con bandas transparentes. Un contrato de
  anclajes/reflow requerirá alcance separado.
- **Frontera preservada:** `WidgetVisualHost` y los renderizadores visuales no se
  modifican. El canvas conserva preview imperativa durante drag/resize.
- **Monitor:** Wails ya aporta `Screens.GetAll` y `Screen.GetByIndex`. Studio
  persiste índice y `layoutViewport` de forma atómica usando `Bounds` CSS/DIP;
  Desktop crea y lleva a fullscreen la ventana sobre esa pantalla exacta. No se
  usa el viewport del Hub, `WorkArea` ni una multiplicación por DPI.
- **Autoridades:** `docs/adr/0092-overlay-arbitrary-layout-viewport.md` y
  `docs/superpowers/plans/2026-08-11-overlay-arbitrary-viewport-parity.md`.

Ledger vivo:

| Task | Contenido | Estado | Evidencia | Próxima condición |
|---|---|---|---|---|
| 0 | ADR, microplan y expediente | Completada | Commit documental; diff check limpio | Task 1 |
| 1 | Contrato TS/Go + transformación pura | Completada | `5a98553` + `a9c2fc8`; TS 67/67, Go pkg y completo PASS; doble review PASS | Task 2 |
| 2 | Superficie editable en Studio | Completada | 2A `b873a82`/`7b24f09`; 2B `8249585`/`50e9b9e`/`5fc3809`; 2C `edf3359`/`13fe677`/`1aa1ec7`; dobles reviews PASS | Task 3 |
| 3 | Paridad Desktop/OBS | Completada | 3A `ecda9ee`/`c8f00e5`; 3B `b4a5c94`/`fb5b5ae`; dobles reviews PASS | Task 4 |
| 4 | Hub fluido + frontera monitor nativo | Completada | `0aa50aa`, `3f819d4`, `30c5292`, `0421e55`, `452b4ce` y correcciones hasta `4703a48`; reviews finales Ready/PASS | Aceptación manual física |
| 5 | Gates, evidencia y cierre | Completada técnicamente | Go completo PASS; frontend 2567/2567; build y diff-check PASS; lint con deuda heredada documentada | Isaac prueba Windows multimonitor y decide promoción |

Evidencia Task 1:

- `layoutViewport` es opcional en storage V3; ausencia conserva 1920×1080 y
  `null` se rechaza igual en TS y Go.
- Límites compartidos: 32..16384 CSS/DIP. Recoverability usa la superficie
  resuelta; no modifica coordenadas legacy.
- Transformación pura `contain` con offsets centrados y mapeo forward/inverse;
  inputs inválidos fallan explícitamente en vez de producir `NaN`/infinito.
- Checks del worker: frontend focal 67/67, frontend completo 2480/2480,
  `go test ./pkg/config`, `go test ./...`, build, lint focal y diff-check PASS.
  El root repitió focal 67/67, Go pkg y diff-check con PASS.
- Review de especificación: PASS. Review de calidad tras correcciones: Ready to
  proceed, cero Critical/Important. Minor aceptado para evidencia acumulada:
  falta test del máximo exacto 16384; la comparación inclusiva fue inspeccionada.
- Ruido heredado: dos `AbortError` de teardown de happy-dom tras la suite, con
  exit 0 y todos los tests PASS.

Evidencia microcorte 2A:

- `document/layout-viewport` persiste el tamaño explícito sin mutar documento,
  comando ni metadata. El parser canónico valida siempre esta edición, también
  en producción.
- Una superficie inválida o que deje widgets irrecuperables falla de forma
  atómica con `StudioCommandError`; Store conserva el historial y publica el
  mensaje. Errores inesperados de permisos o commit se relanzan.
- Dirty, undo, redo y save están cubiertos; acceso lo trata como mutación layout
  documental sobre layouts persistidos.
- Commits: `b873a82` y corrección de spec `7b24f09`. Root repitió focal 66/66.
  Build PASS. Spec review PASS y quality review Ready, cero Critical/Important.
- Minors aceptados: los tests no hacen observable la deduplicación interna de
  permisos (layout hoy es incondicional) ni fuerzan un error inesperado desde
  `commitStudioCommand`; la implementación de ambos caminos fue inspeccionada.
- Task 2 se divide en 2A estado, 2B geometría pura y 2C canvas/controles para
  mantener write sets acotados y review entre cortes.

Evidencia microcorte 2B:

- Fit, clamp, snap, safe area, center, move y resize consumen `LayoutViewport`.
  Los aliases 1920×1080 quedan deprecados y solo como fallback transitorio de
  callers que 2C debe eliminar.
- Matriz TDD: 1280×720, 3440×1440, 5120×1440, 1000×1000 y bordes custom 1006px
  no alineados a la rejilla.
- Review detectó dos regresiones de borde antes de 2C: snap posterior al clamp
  podía perder recoverability en move y las guides de resize podían quedar en
  la posición previa al clamp. Corregidas en `50e9b9e` y `5fc3809` con cobertura
  X/Y y guías perpendiculares.
- `MINIMUM_VISIBLE` deriva ahora de la autoridad core. Preview drag/resize sigue
  imperativa y solo hace commit al terminar.
- Evidencia final: focal 73/73, build, lint focal y diff-check PASS. Spec review
  PASS y quality review Ready, sin Critical/Important/Minor nuevos.

Evidencia microcorte 2C:

- `StudioPreviewState` ya no contiene una resolución ficticia. El documento
  gobierna dimensiones, fit, área segura, interacción y todas las rutas visibles
  de centrado; los perfiles legacy conservan el fallback 1920×1080.
- Presets planos y dimensiones custom 32..16384 persisten mediante
  `document/layout-viewport`. La escena muestra límites propios sobre un stage
  neutral; el fondo seleccionado pertenece a la escena y el panel es responsive.
- Dos reviews detectaron estados engañosos del selector ante un preset rechazado
  y ante volver al preset vigente desde un draft custom. Se corrigieron en
  `13fe677` y `1aa1ec7`; selector, drafts, cabecera, escena y documento quedan
  sincronizados sin hacer optimista un cambio que recoverability pueda rechazar.
- Evidencia final independiente: focal 9 archivos 55/55, regresiones de geometría
  y preview imperativa 67/67, build y diff-check PASS. Spec review PASS y quality
  review Ready, cero Critical/Important. Lint conserva únicamente 4 errores y 1
  warning heredados en líneas anteriores a ISA-326.
- Observación aceptada: elegir explícitamente 1920×1080 en un perfil legacy puede
  materializar `layoutViewport` y marcar dirty; es coherente con persistir la
  superficie seleccionada según ADR 0092.

Ejecución Task 3:

- **3A — superficie runtime compartida:** medir la salida CSS, aplicar una sola
  transformación `contain` a la escena lógica y demostrar paridad Desktop/OBS,
  offsets centrados, legacy y `layoutOrigin` lógico.
- **3B — preview y app OBS:** hacer que la preview reciba la superficie
  documental y eliminar sus imports de constantes Studio, sin doble escala.
- Los microcortes son secuenciales y cada uno exige spec review y quality review
  antes de avanzar; sus write sets no se solapan.

Evidencia microcorte 3A:

- `RuntimeOverlaySurface` mide la caja CSS no transformada y aplica una única
  transformación `contain` a una escena lógica. Desktop y OBS comparten la misma
  implementación; frames y `layoutOrigin` permanecen en espacio lógico.
- La escena espera una medida positiva, soporta resize fraccional, legacy
  1920×1080, offsets X/Y y limpia observer/listener. Los subtítulos viven dentro
  de la misma escena; ningún renderer ni `RuntimeWidgetFrame` fue modificado.
- Spec review detectó dos Important antes de 3B: `getBoundingClientRect` podía
  medir un ancestro ya escalado y causar doble escala, y `overflow: visible`
  permitía que widgets parciales contaminaran bandas transparentes. Corregidos
  en `c8f00e5` usando `contentBoxSize/contentRect` o fallback `clientWidth/Height`,
  y clipping en el límite documental.
- Evidencia final: focal raíz 5 archivos 39/39, build, ESLint focal y diff-check
  PASS. Spec review PASS y quality review Ready, cero Critical/Important.
- Gate 3B: la API OBS todavía entrega `layoutOrigin` shrink-wrap mientras Desktop
  usa cero. 3B debe normalizar esa diferencia y demostrar paridad end-to-end;
  no basta con la paridad del componente bajo inputs iguales.

Evidencia microcorte 3B:

- La preview OBS recibe el `layoutViewport` documental, elimina toda dependencia
  de constantes Studio y usa el transform `contain` core sobre una caja CSS no
  transformada. Espera la primera medida válida, soporta dimensiones
  fraccionales y limpia `ResizeObserver` o el fallback de `window.resize`.
- En preview, la escena exterior aplica una sola escala y el runtime interior
  mide la superficie lógica con `scale=1`. En streaming, el runtime mide la
  salida real. Un documento 1000x1000 sobre 1600x900 conserva escala 0,9,
  offset X 350 y coordenadas documentales `x=123`, `y=87`.
- `ObsOverlayApp` ignora el `layoutOrigin` shrink-wrap legado del endpoint; OBS
  deja de desplazar widgets respecto a Desktop. El fondo y la cuadrícula quedan
  dentro de la escena y las bandas exteriores permanecen neutrales.
- Spec review detectó que el recordatorio de calendario también se escalaba en
  preview. Se corrigió en `fb5b5ae`: solo el runtime entra en la escena
  documental y el banner permanece como capa de salida, con cierre intacto.
- Evidencia final independiente: focal 8 archivos 64/64, suite frontend
  2543/2543, build, ESLint focal y diff-check PASS. Spec review PASS y quality
  review Ready, cero Critical/Important. Ruido heredado: dos `AbortError` de
  teardown con exit 0 y warnings de `.eslintignore`/chunk. Smoke visual real
  pendiente para Task 5.

Evidencia Task 4 y cierre acumulado:

- El workspace Profiles/Studio usa todo el ancho disponible sin quitar el cap de
  1920 px a las demás secciones. Focal 21/21, suite completa 2545/2545, build y
  review PASS (`0aa50aa`).
- El cliente nativo enumera pantallas en CSS/DIP, tolera nombres vacíos y valida
  índice seguro. El comando `document/monitor` hace monitor+superficie en un solo
  paso de dirty/undo/redo; la UI conserva custom si Wails no está disponible.
  Commits `3f819d4`, `30c5292` y `0421e55`; reviews Ready sin Critical/Important.
- Desktop resuelve la pantalla exacta, usa sus `Bounds` para la colocación inicial
  y después fullscreen. Los cierres tardíos de una ventana reemplazada no pueden
  cerrar ni desincronizar la nueva; la identidad no comparable falla sin panic y
  los side effects quedan serializados. Commits desde `452b4ce` hasta
  `4703a48`; spec PASS y quality Ready, cero Critical/Important.
- Gates acumulados sobre `4703a48`: `go test ./...` PASS; frontend 360 archivos,
  2567/2567 PASS; build y `git diff --check origin/nightly...HEAD` PASS. ESLint
  directo sobre los 53 TS/TSX tocados queda rojo con 6 errores y 1 warning en
  líneas heredadas; el global conserva 36 errores y 2 warnings. Las comparaciones
  contra el baseline hechas por microcorte no encontraron violaciones nuevas.
  La suite conserva dos `AbortError` de teardown de happy-dom tras el resumen,
  con exit 0.
- Inspección T3 del harness Studio: superficies 3440×1440 y custom 1000×1000;
  viewports 1440×900, 1024×768 y 800×700 sin scroll horizontal del documento y
  con escala uniforme. El navegador no dispone del runtime Wails ni de un perfil
  servido por el backend, por lo que no sustituye la prueba física Desktop/OBS.
- Riesgos aceptados: `monitorIndex` es posicional y la enumeración solo se
  refresca al abrir Studio; hot-plug durante la sesión requiere reabrirlo. La
  prueba manual Windows con dos monitores/DPI mixto queda pendiente para
  Nightly; Isaac excluyó OBS como gate de este corte.
- Smoke Wails posterior al cierre: build y arranque nativo PASS; Hub 1280×800,
  WebView2 y `/health` operativos. El host solo tiene `DISPLAY1` 1920×1080 y el
  Studio real requiere login/configuración Supabase ausente en este worktree, así
  que multimonitor/DPI mixto continúa siendo gate humano.
- El smoke HTTP con un perfil V3 custom 1000×1000 confirmó que
  `/api/profile-v3` conserva `layoutViewport`, pero `/overlay` quedó vacío: la
  CSP preexistente permite inline y bloquea los módulos/estilos propios de Vite.
  ISA-329 (`OBS · CSP local bloquea los assets propios y deja /overlay vacío`)
  queda como bug High abierto y limitación conocida; por decisión explícita de
  Isaac no bloquea esta Nightly. No se amplió silenciosamente el write set de
  ISA-326 para tocar seguridad/servidor.
- Promoción completada el 2026-08-12: ISA-330 creó una rama de integración desde
  `origin/nightly@5069cbb`, fusionó la rama ISA-326 (`7600206`) mediante
  `--no-ff` en `d0789e5`, incorporó después el PR #207 desde
  `origin/nightly@cc54d36` en `e45bcf9` y preparó `v0.1.0.7-nightly.7`. El PR
  #208 pasó CI y se fusionó por squash en `nightly@234794d`. `testers` y
  `master` quedaron fuera del corte.
- Gates locales combinados finales de ISA-330 sobre `cc54d36`: Go completo PASS;
  frontend 367 archivos/2636 tests PASS; build PASS; diseño 3/3; visual Studio PASS con widgets,
  paridad, interacción y los tres viewports responsive a 0.000 %. Los tres
  baselines de Studio se actualizaron después de inspeccionar que el cambio era
  el `contain` aprobado y no una pérdida de paneles o controles. Lint global
  sigue rojo por deuda previa, pero pasa de 47 errores/2 warnings en
  `cc54d36` a 44/2 en la integración; no añade deuda.
- Release publicada: el workflow oficial `Release build` run `31633854889`
  terminó PASS en el rerun final sin cambios de código y publicó
  `v0.1.0.7-nightly.7` sobre `234794d`. La pre-release no es draft, contiene
  los seis assets oficiales y la descarga independiente confirmó los SHA-256
  del instalador, portable y ejecutable. Los dos intentos anteriores fallaron
  antes de publicar por descarga transitoria de Electron y por el soak Windows
  intermitente ya inventariado. ISA-329 sigue abierta como limitación OBS
  aceptada expresamente para este corte; no se afirma paridad OBS.

## ISA-369 / HUD-ORBIT-01 — fundamentos Command Orbit v0.3 (2026-08-17)

- Alcance aislado del briefing `docs/design/orbit-v03/15-briefings/00-fundamentos.md`.
  No toca páginas, shell, kit completo ni algoritmos de dominio.
- Rama
  `vantareapp/isa-369-hud-orbit-01-fundamentos-orbit-tema-tokens-sprite-de-iconos`,
  worktree `C:\tmp\vantare-isa369`, base real `origin/nightly@7a92241d` y
  commit funcional `cd34753a`. `e6a8a994` está contenido en la base.
- `VantareTheme` reconoce `vantare-orbit`; sus extensiones son opcionales y
  emiten defaults Orbit para mantener compatibles `vantare-v5` y
  `vantare-lite`. El runtime resuelve el tema almacenado sin convertirlo aún
  en tema predeterminado.
- `orbit.tokens.css` coincide línea por línea con la copia canónica y expone
  utilidades Tailwind 4. Inter variable y Cascadia Code se empaquetan en
  `frontend/src`; el harness comprueba que no hay requests a Google Fonts.
- El sprite contiene los 14 símbolos del prototipo y `ui/orbit/Icon` conserva
  tamaño/trazo configurables. La densidad usa la clave
  `vantare.v03orbit.density` y aplica `body.dataset.density` con fallback
  `balanced` tolerante a fallos de storage.
- Evidencia fresca: focal 3 archivos/14 tests PASS; suite frontend 390
  archivos/2869 tests PASS; build PASS; ESLint focal PASS;
  `visual:orbit-foundations` PASS. Capturas balanced/compact 1920×1080 en
  `docs/design/orbit-v03/evidence/porte/00-fundamentos/`, inspeccionadas sin
  iconos ausentes, recortes ni fallos tipográficos.
- Lint global: 46 errores/2 warnings tanto en esta rama como en un worktree
  temporal limpio de `origin/nightly@7a92241d`; la deuda es heredada y no se
  corrigió fuera de alcance.
- Review propio en cinco ejes: Approve, sin Critical/Required pendientes. PR
  draft #279 abierto a `nightly`; `01-shell` permanece bloqueado hasta la
  aceptación de este briefing.

## ISA-838 — cambio de sección de Studio sin remontaje (2026-08-25)

- Rama `vantareapp/isa-838-studio-tab-fluidity`, worktree
  `C:\tmp\vantare-isa838`, base limpia
  `origin/nightly@8a90c3a7837166ffec6943c839f7cb31cbf11b31`. ISA-770 no era
  autoridad para este bug de rendimiento; se abrió ISA-838 y se añadió al
  Project Vantare en `In Progress` antes de editar.
- Había dos desmontajes productivos: `StudioRouteEditor` sustituía
  `OverlayStudioV3` al entrar en Perfiles/Recomendados/Comunidad/OBS y
  `OrbitShell` eliminaba `StudioRoute` al entrar en Launcher u otra sección.
- La ruta interna conserva el editor y lo vuelve inerte mientras pinta la vista
  secundaria. La shell monta Studio de forma perezosa en la primera visita y
  conserva después la misma instancia; la ruta memoizada no vuelve a renderizar
  por un cambio ajeno de sección.
- El keep-alive oculta globalmente con `display:none`, `aria-hidden` e `inert`.
  Un gate de actividad estable desconecta los suscriptores visuales del
  coordinador sin remontar React ni reiniciar el transporte live; al volver se
  reconectan al último snapshot. Los `WidgetVisualHost` y el renderer productivo
  siguen siendo únicos.
- Regresiones: misma identidad DOM interna y global, lazy mount, inercia,
  suspensión/reanudación de suscripciones y transporte live single-start.
  Suite frontend completa: 386 archivos y 2958/2958 tests PASS. Typecheck PASS,
  build frontend PASS y build Wails production con el `.env.local` autorizado
  embebido PASS. ESLint focal PASS; el global conserva el error heredado
  `_damage` no usado en `car-damage-numbers-view-model-v2.ts`.
- A/B Wails sobre la misma base, tres tandas de 20 idas y vueltas
  Studio↔Launcher por build: mediana de CPU del renderer 41,41 ms/roundtrip en
  baseline y 33,59 ms/roundtrip en ISA-838 (-18,9 %). El tag production desactiva
  CDP por contrato, por lo que no se presenta esta medida como traza
  click-to-paint ni como garantía absoluta de ausencia de hitch.
- Smoke Wails real PASS: sesión resuelta, Hub, Studio y Launcher visibles; cuatro
  capturas A/B en
  `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2\fotos\isa-838-{baseline,final}-{studio,launcher}.png`.
- Entrega funcional `b87fe14e`, rama publicada y PR draft #851 abierto hacia
  `nightly`; issue, label y Project Vantare en `In Review`. Sin merge,
  promoción, release ni cambio del roadmap público.
- Riesgo residual aceptado: tras la primera visita, Studio retiene su documento
  y DOM en memoria para que las vueltas sean instantáneas. La primera apertura
  sigue pagando el montaje inicial; las afirmaciones de fluidez se limitan a
  cambios posteriores entre secciones ya visitadas.

### Extensión ISA-838 — feedback inmediato del rail (2026-08-26)

- Un probe Wails posterior separó el primer cambio del contenido del feedback
  del rail: en 20 alternancias Studio↔Launcher el contenido empezaba a cambiar
  con mediana de 1,40–1,43 ms, mientras el marcador activo aparecía con mediana
  de 34,20–34,47 ms en ambos sentidos sobre un monitor de 60 Hz. La simetría
  descarta la reactivación de Studio como causa dominante de esa sensación.
- El rail esperaba a `onClick` y después interpolaba de forma genérica todas las
  propiedades durante `--orbit-fast` (130 ms). Ahora acusa la pulsación nativa
  de inmediato, deja el fondo fuera de la interpolación y limita color,
  `box-shadow` y retorno de escala a 60–80 ms. No añade estado React optimista
  ni altera la fuente de verdad de navegación.
- Se añadió un contrato focal que protege el feedback de presión y evita
  reintroducir la transición genérica. Gates frescos: focal 17/17 PASS, suite
  completa 387 archivos y 2960/2960 tests PASS, typecheck PASS, lint focal PASS,
  build frontend PASS y build Wails production con el `.env.local` autorizado
  embebido PASS. El lint global conserva exclusivamente el error heredado
  `_damage` no usado en `car-damage-numbers-view-model-v2.ts`.
- Smoke Wails real aceptado por Isaac: el sidebar funciona «mucho mejor».
  Captura posterior en
  `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2\fotos\isa-838-sidebar-feedback-after.png`.
  La imagen es evidencia local y no se versiona.

## ISA-893 — checkpoint de autoridad Overlay V2 (2026-08-28)

- Rama `vantareapp/isa-893-overlay-v2-autoridad-completa`, worktree
  `C:\tmp\vantare-isa893\vantare-v2`, base exacta
  `origin/nightly@f2e73d3aec1cadb47586cdea07fdbc54effea58f`.
- Hitos 1–6 publicados: inventario 20/20; contexto runtime puro derivado de
  V2; selección V2-first en el único `WidgetVisualHost`; fallos
  inválido/ausente/error terminales y stale visible; rollback total solo en
  memoria; gate cerrado catálogo 20 = políticas 20 y builders V2 no externos
  18.
- `engineer-radio` consume exclusivamente `engineerPresentation` y
  `race-schedule` recibe `raceScheduleEvents` desde Calendar. Ninguno convierte
  su fuente auxiliar en telemetría V2.
- Evidencia focal acumulada: contexto/visibilidad/layout 19 tests PASS; host y
  auxiliares 33 PASS; estados V2 22 PASS; rollback/registro/host 30 PASS;
  comparador 28 PASS. `pnpm --dir frontend typecheck` PASS después de cada
  hito de código. La suite completa y builds quedan para el cierre integrado.
- Bloqueo de coordinación vigente: no editar `CompositeApp.tsx`,
  `ObsOverlayApp.tsx`, `RuntimeOverlaySurface.tsx`, `RuntimeWidgetFrame.tsx` ni
  `telemetry-rate-coordinator.ts` hasta que #936 llegue a `nightly`. Después se
  debe rebasar y eliminar los adaptadores V1 transitorios de layout/visibilidad,
  activar `overlayV2Authority` en Studio/Desktop/OBS y ejecutar los gates
  completos más Wails/LMU real.
- Riesgo operativo de la issue: #893 conserva simultáneamente las labels
  `roadmap:required` y `roadmap:not-required` y todavía no enumera el token
  exacto de roadmap. Debe resolverse antes del commit semántico de `plan.md` y
  de los gates finales.
- No hay PR, merge, promoción ni release. HEAD funcional antes de este
  checkpoint: `0a25f4ad`.

## ISA-962 — integración final Endurance Redline (2026-09-01)

- Rama aislada `vantareapp/isa-962-redline-final-integration`, base exacta
  `origin/nightly@659b2c57dc2c7fc75962cc3c8e425ed1289266ec`; commit funcional
  `bf13921a93d7a662ab2f59526d5f1258217141f2`.
- El candidato integra #957, #958, #959, #960, #961 y #968. La fixture Relative
  deriva de la fila canónica V2; no añade fallback ni relaja `OverlayQValue`.
- Tras reproducir en capturas físicas los saltos, cruces y celdas recortadas,
  Mirror, Proximity y Traffic dejaron de usar FLIP/ghosts y representan el
  orden físico de cada frame directamente. El exterior transparente quedó
  confirmado sobre checkerboard; las capturas anteriores no se declaran PASS
  porque proceden de boxes y de un HEAD previo.
- S3 ya no puede ejecutarse desde el colector genérico. El catálogo fuente
  versiona exactamente Standings Redline, Relative Mirror/Proximity/Traffic y
  Pedals Redline; su materializador genera perfiles e índice ligados al HEAD.
  Delta y cualquier criterio de vuelta están excluidos.
- Gates frescos: focal Relative 9/9 PASS; scripts de banco 22/22 PASS; frontend
  completo 441 archivos y 3421/3421 tests PASS; typecheck, build, ESLint focal,
  `node --check`, digest de roadmap y `git diff --check` PASS. El build conserva
  únicamente el aviso informativo de chunks mayores de 500 kB.
- Revisión adversarial final sobre `1363de97` APPROVE, sin P0/P1. La rama está
  publicada y el PR draft #969 apunta a `nightly`. CI sobre `9af9daa6` falló
  en el run `33502297892`: falta Chromium headless de Playwright al ejecutar
  tests frontend. Promotion path y GitGuardian pasaron; no es CI global verde.
- Pendiente físico: ejecutar S3 con el jugador en pista (máximo cinco minutos
  por comprobación), después S4, S5 y S2 al final, según el plan maestro.
  Corrección del diagnóstico anterior: no se demostró que RawInput descartara
  teclas; solo se observó falta de respuesta y una discrepancia entre la
  pantalla controlada y los procesos locales. R2 debe demostrar que se controla
  el mismo entorno antes de otra prueba. Boxes no es PASS. Sin merge ni release;
  la autorización condicional de Isaac del 2026-09-02 no equivale a integración.

## ISA-968 — Standings Redline estrecho (2026-08-31)

- Rama aislada `vantareapp/isa-968-standings-redline-narrow`, worktree
  `C:\tmp\vantare-isa968\vantare-v2`, base exacta
  `bff576bc3d8175bf986ff7bfef56c19b1ad5e7ab`.
- RED productivo: la regresión con el golden Overlay V2 de 20 vehículos falló
  en `desktop/280px` con 32 descendientes fuera del frame; raíz, bloque y filas
  medían 430 px y las columnas Gap/Última vuelta quedaban recortadas.
- Solución final: únicamente Standings Redline calcula un mínimo desde sus
  columnas y amplía el frame físico efectivo cuando el ancho persistido no
  basta. No comprime tipografía, no oculta columnas y no conserva el escalado
  visual alternativo. Desktop, Studio y OBS comparten esa misma geometría.
- GREEN: matriz productiva ready en Desktop, Studio y OBS a 280, 340, 419 y
  420 px, más missing en Desktop/OBS, sin descendientes visibles fuera del
  frame. Focal ampliado: 6 archivos y 24/24 tests PASS. Typecheck, build y lint
  frontend PASS; el build conserva únicamente el aviso informativo de chunks
  mayores de 500 kB. Digest de roadmap y dry-run del fragmento ISA-968 PASS.
- La validación física S3 Wails/LMU no se ejecutó por instrucción expresa de
  este corte y permanece pendiente antes de promoción. Trabajo solo local: sin
  app, push, PR, CI remoto, merge, promoción ni release.
- Cierre adversarial integrado en ISA-962: un perfil heredado en `x=1639,
  w=280` se representa a `x=1094, w=826`; al arrastrar 100 px a la izquierda
  persiste `x=994` sin salto, hacia la derecha permanece acotado en `x=1094`,
  y un click sin movimiento no ensucia ni autosalva el documento. Selección y
  tiradores acompañan siempre al frame efectivo. El renderer Redline publica
  además
  `data-session-mode` y `data-position-delta` para que S3 demuestre Practice y
  cero ganadas/perdidas sin depender de clases CSS. Candidato integrado:
  frontend 441/441 archivos y 3.418/3.418 pruebas, Go completo, build y lint
  PASS; revisión adversarial de la rama ISA-968 APPROVE. S3 físico sigue
  pendiente sobre el nuevo HEAD.
