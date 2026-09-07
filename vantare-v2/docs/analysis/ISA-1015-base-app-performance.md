# ISA-1015 — rendimiento de la base de Vantare

Estado a 2026-09-08: inventario, perfiles legibles y tres capturas reales de Inicio junto a LMU completados. Isaac amplía el objetivo a rapidez de pantallas e interacción.
**Hay una referencia descriptiva; no hay A/A aceptado, ahorro demostrado ni optimización productiva.**
Autoridad: [issue #1015](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1015).
Continuidad: `docs/vantare-program/handoffs/platform-commercial.md`; este informe no crea otro handoff.

## Base y alcance aprobados

- Base remota comprobada: `origin/nightly` en `d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2`.
- Rama: `vantareapp/isa-1015-base-app-performance`.
- Worktree: `C:/tmp/vantare-isa1015-base-app`; aplicación en su subdirectorio `vantare-v2`.
- Checkout principal preservado: `fix/overlay-strictmode-dispose@d717f732`, dos archivos de configuración modificados y 46 entradas no seguidas al inicio. No se incorporan.
- Incluye arranque, cierre, reposo, minimizado, Hub, navegación, Launcher, Carreras, Ajustes, Engineer, Strategy, Analysis/grabación y servicios comunes.
- Excluye HUD Desktop/OBS, widgets, renderizadores, Overlay Studio, canvas, inspector, editor, efectos/cadencias y transportes específicos de overlays, incluido E20.
- En rutas compartidas se mantienen contratos, seguridad, datos, orden, frescura, audio, reconexión y consumidores excluidos. No se elimina blur, animaciones, información ni capacidad visual para obtener una cifra menor.
- Los cortes productivos necesitan issue propia, reproducción, pruebas y medición. Esta issue cubre inventario, protocolo, tooling y baseline. No autoriza integración, promoción o release.

Las referencias de código siguientes son relativas a `vantare-v2` y sus líneas
corresponden a la base indicada, salvo la sección de tooling de esta entrega.

## Rapidez de pantallas e interacción: ampliación aprobada

Además de CPU, RAM y GPU, medir arranque hasta Inicio utilizable, primera apertura
y visitas posteriores de cada pantalla, respuesta a botones/pestañas/filtros,
desplazamiento, animaciones y restauración de ventana. Inicio, Carreras y Ajustes
son el primer recorrido; ampliar después al resto de la matriz de la base.
HUD y Overlay Studio siguen excluidos. No acortar efectos, ocultar contenido ni
omitir validaciones para aparentar rapidez.

Por transición registrar por separado: entrada del usuario, primera respuesta
visible y contenido real utilizable (sin carga pendiente ni controles bloqueados).
La aparición del contenedor DOM no demuestra contenido completo ni presentación
en pantalla; rAF y CDP aportan diagnóstico, no prueba de píxeles presentados.
Declarar el criterio específico de contenido preparado antes de cada captura.
Registrar esperas de datos, tareas largas y trabajo de render por separado para
atribuir la demora. Medir primero sin perfilador; instrumentar después una
repetición independiente. No construir otro banco si el existente lo cubre.

Separar arranque de proceso, caché fría de datos y revisita caliente: reiniciar
la app no vacía por sí solo la caché del sistema. No borrar datos ni credenciales.
Comparar mismas rutas/datos/viewport/Auto y situación del simulador. Para cada
transición, conservar valores individuales y mediana; usar p95 solo con muestra
suficiente y declarar su tamaño. Las pruebas de rapidez requieren Hub en primer
plano estable; las capturas de reposo en segundo plano no sirven para certificar
latencia percibida. Si otra app retiene el foco, avanzar en atribución estática y
dejar esa prueba visual pendiente, sin controlar aplicaciones ajenas.

Aceptar un corte solo si mejora su métrica objetivo por encima del ruido y no
empeora consumo, respuesta, datos o apariencia en los escenarios afectados.
No existe todavía una cifra de tiempo de apertura o navegación validada.

La lectura del recorrido confirma que OrbitShell importa estáticamente las rutas
base (`frontend/src/hub/components/orbit/OrbitShell.tsx:45`) y monta solo la activa
(`:588`). Es una hipótesis de coste de arranque, no una mejora demostrada: diferir
una importación puede trasladar espera a la primera visita. No modificar Studio
ni su keep-alive. Para Inicio/Carreras el calendario debe haber llegado desde
`calendar:loaded`, no basta con listas vacías iniciales (`use-calendar-starts.ts:41`).
Mes requiere su cuadrícula real y Timeline filas/bloques acordes al documento;
no fijar las 11 series observadas como dato universal. Ajustes debe comprobar
`data-section`, panel y controles de la subsección elegida, sin medir una sección
restaurada distinta (`SettingsOrbitPage.tsx:169`). Reutilizar esos selectores
productivos y el helper CDP existente antes de añadir instrumentación.

## Skills aplicadas

| Skill | Uso concreto y límite |
| --- | --- |
| Ponytail full | Reutilizar el banco y el estado existentes; un corte pequeño por hipótesis; evitar sensores, stores y arquitectura paralelos. |
| performance-optimization | Medir y atribuir antes de editar. Sus recetas web y umbrales genéricos no sustituyen el runtime Windows. |
| golang-benchmark / golang-performance | CPU, asignaciones, perfiles y benchmarks focales tras localizar una ruta. Un benchmark Go no certifica el consumo total Wails. |
| systematic-debugging | Reproducir el trabajo innecesario y proteger su comportamiento antes del cambio. |
| browser-testing-with-devtools | Inspección del target Wails real, estado y perfilado separado. Una página de navegador o una captura DOM no prueba visibilidad nativa. |
| code-simplification / source-driven-development | Recorrer productor, consumidores, cancelación y tests; reutilizar y simplificar solo donde la evidencia lo justifique. |

Los alias Go duplicados no añaden otra metodología. `vantare-core` queda fuera
porque AGENTS lo declara desactualizado. No se han instalado skills, hooks ni dependencias.

## Inventario general observado

| Área | Comportamiento actual y evidencia |
| --- | --- |
| Inicio y navegación | `frontend/src/hub/components/orbit/OrbitShell.tsx:45` importa las rutas base de forma estática; `:588` monta solo la ruta activa. Desmontar una página no descarga sus módulos ya importados. El keep-alive específico de Studio queda fuera. |
| Providers del Hub | `frontend/src/hub/HubApp.tsx:256` mantiene licencia, idioma, cadenas y Launcher durante la vida del Hub. `:151` recibe source-status sin comparar identidad; falta medir frecuencia del productor y renders atribuibles. |
| Auth y licencia | `frontend/src/lib/AuthSessionBridge.tsx:23` conserva suscripciones con limpieza. `frontend/src/lib/license-provider.tsx:77` escucha cambios y tiene timeouts de arranque, no un intervalo propio. Go agrupa validaciones simultáneas en `cmd/vantare/main.go:1891`. Seguridad y restauración se mantienen. |
| Calendario común | `frontend/src/hub/orbit/use-calendar-starts.ts:40` pide y suscribe calendario; `:48` recalcula cada 15 s. Shell, Strategy (`StrategyOrbitPage.tsx:419`) y Schedule (`ScheduleImportSection.tsx:30`) montan instancias; Schedule solo consume el documento. |
| Carreras | `frontend/src/hub/races-orbit/RacesOrbitPage.tsx:135` monta relojes de 1 y 30 s. `useClock` crea un Date por render (`:96`), por lo que invalida la lista de columna de `:300` también a 1 Hz. Mes y Timeline reconstruyen modelos por cambios de identidad temporal (`:230`). Coste por demostrar. |
| Launcher | `frontend/src/hub/launcher/launcher-store-core.ts:97` ya limita discovery con TTL de cinco minutos y petición en curso. No repetir la hipótesis antigua de un escaneo completo en cada visita. Watchdog cada 5 s en `frontend/src/hub/launcher/ChainRunnerProvider.tsx:23`. Backend sin polling en constructor (`internal/app/launcher/launcher.go:74`), caché de iconos existente (`icon_windows.go:1012`). |
| Ajustes y páginas auxiliares | Ajustes monta solo subsección activa (`frontend/src/hub/settings-orbit/SettingsOrbitPage.tsx:190`); Diagnóstico consume métricas en `:1400`. Roadmap cancela fetch al desmontar (`frontend/src/hub/roadmap-orbit/RoadmapOrbitPage.tsx:75`). Testing guarda tras edición, sin polling general (`frontend/src/hub/testing-center-orbit/TestingCenterOrbitPage.tsx:204`). |
| Core sin LMU | `cmd/vantare/main.go:1334` habilita live por defecto. El monitor despierta cada 100 ms (`internal/app/telemetry_core_runtime.go:901`); el manager reintenta hasta cada 5 s (`internal/telemetry/core/driver_manager.go:519`). El ticker de adquisición de 60 Hz y REST se crean después de abrir el mapping (`internal/telemetry/drivers/lmu/driver.go:242`); no atribuirles consumo cuando falta. |
| Diagnóstico Ops | Arranca siempre (`cmd/vantare/main.go:3013`), muestrea y publica cada 1 s (`internal/app/ops_bridge.go:43`), incluido ReadMemStats (`internal/ops/sampler.go:80`), aunque el panel de diagnóstico no esté montado. |
| Automático | Es el modo predeterminado (`internal/app/settings_service.go:73`). El sensor muestrea a 1 Hz y enumera procesos cada 5 s; intenta iniciar PresentMon sin comprobar previamente que exista LMU (`internal/app/performance/sensor/presentmon.go:117`). Ocultar Hub suprime eventos visuales, no adquisición (`internal/app/performance_runtime.go:220`). No apagar Auto para simular ahorro. |
| Engineer | Se construye y arranca siempre (`cmd/vantare/main.go:2097`). La cola espera eventos o cancelación, sin ticker (`internal/engineer/service/delivery_runtime.go:132`). Ante estado de fuente idéntico retorna pronto (`engineer_service.go:1030`). Goroutine viva no equivale a coste periódico demostrado. |
| Strategy | Repositorio y catálogo se preparan al arrancar (`cmd/vantare/main.go:1553`); la proyección pública está desactivada por defecto (`:1335`). No se encontró composición productiva de StrategyLiveRuntime en cmd/vantare; no atribuir un solver continuo al reposo. |
| Analysis y grabación | Analysis verifica bundle al arrancar (`internal/app/telemetry_analysis_service.go:136`); abre helper por petición autorizada (`:292`). Diagnóstico compone SQLite como lector (`internal/app/diagnostics_bridge.go:118`). No se encontró coordinador de grabación compuesto en cmd/vantare. Telemetry Orbit vacío/demo no demuestra una sesión Analysis real. |
| Arranque del runtime | Analysis y Strategy cold start llaman LoadRuntime separadamente (`telemetry_analysis_service.go:157`, `internal/strategy/coldstart/lmu_importer.go:94`), que verifica archivos por hash (`internal/telemetryanalysis/duckdbadapter/manifest.go:199`). Medir el arranque; no omitir comprobaciones de integridad. |
| Calendario Go / updater / hotkeys | Recordatorios cada 30 s, retorno temprano sin series seguidas (`internal/calendar/calendar_service.go:562`). Updater por petición con cooldown (`cmd/vantare/main.go:2605`). Hotkeys bloquea en GetMessageW (`internal/app/hotkeys.go:248`), no hace polling. |

Minimizado tiene dos estados distintos: ventana retenida con nivel menor de 3 o
bloqueo, y ventana destruida con nivel eficiente y registro limpio
(`internal/app/hub_lifecycle.go:64`, `:91`). No confundir ausencia de render con
throttling, ni forzar nivel 1 para evitar la destrucción. Registrar nivel efectivo,
blockers y estado de la ventana en cada corrida. No visitar Studio durante la base;
si se visitó, reiniciar el escenario antes de medir.

## Tres prioridades para la primera atribución

El orden refleja claridad del trabajo observado y tamaño del posible corte,
**no un ranking de consumo medido**.

1. **Ops sin consumidor.** Contar muestras y emisiones en Inicio → Diagnóstico → Inicio → minimizado. Si es material, demanda del panel con muestra inmediata al abrir, misma cadencia visible y cancelación al cerrar/recrear. Protección existente: `internal/app/ops_bridge_test.go:45`; añadir regresión de ausencia de trabajo y reactivación antes del corte.
2. **Búsqueda de versión con LMU ausente.** `internal/telemetry/drivers/lmu/driver.go:230` busca build antes de abrir mapping; Windows puede consultar procesos, Steam, registro y ejecutable (`version_windows.go:103`). Medir llamadas, CPU e I/O por reintento. Evaluar abrir mapping primero y obtener evidencia de build antes de interpretar bytes; preservar cierre, cancelación, detección y reconexión. Tests existentes: `driver_test.go:38`, `:87`, `:322` y `version_disk_windows_test.go:243`.
3. **Carreras y calendario duplicado.** Perfilar Carreras Mes/Timeline y Ajustes Schedule/Strategy con calendario real. Primer corte posible: estabilizar identidad del reloj de 30 s; por separado, evitar calcular salidas donde solo se lee calendario. Mantener cuenta atrás visible de 1 s, fronteras horarias/medianoche, seguimiento y recordatorios. Tests: `frontend/src/hub/races-orbit/RacesOrbitPage.test.tsx:109`, `races-orbit-model.test.ts:168`, `frontend/src/hub/orbit/race-starts.test.ts:66`. El reloj fijo actual no cubre ticks reales.

El coste de Auto/PresentMon, imports iniciales y verificaciones de arranque queda
inventariado para atribuir si las tres prioridades no ofrecen mejora. No abre
cortes adicionales ni justifica alterar contratos compartidos de HUD/Studio.

## Banco: capacidad actual y preparación local

Escenario principal vigente desde 2026-09-08: Isaac autoriza medir junto a LMU,
que permanece abierto igual que Edge. `A0 -BaseRoute home|month|timeline` mide
el árbol propio de Vantare con `measurementMode=base-with-game`; LMU se registra
en un CSV de contexto separado, sin sumarlo ni descontarlo de los recursos propios.
No usa PresentMon adicional, no cambia PATH/ETW ni controla el simulador.
Auto conserva su comportamiento: sourceHz puede fluctuar sin cambiar de nivel;
se observan pasivamente los estados de fuente de ops:metrics. Un cambio de
estado/nivel, pérdida de eventos o desaparición/reinicio del PID de LMU invalida
la estabilidad. Fuente live/stale y sourceHz no identifican por sí solos menú
o conducción. No mezclar estas capturas con las anteriores sin juego.
59/59 pruebas del banco PASS; dos regresiones reprodujeron el bloqueo anterior.
La revisión posterior detectó primer evento de fuente tardío no contabilizado y
metadato de juego contradictorio al inicio; ambos reproducidos (RED) y corregidos
(GREEN). Primera comprobación real cancelada antes de muestrear porque Hub estaba
visible pero no foreground; LMU y Edge permanecieron intactos. Se repite activando
únicamente la ventana propia. Dos intentos no consiguieron foreground (Racelab
conservaba el foco) y no produjeron medida. Para coexistencia se usan los hechos
nativos ya disponibles: Hub presente, visible, no minimizado y foco constante,
etiquetado foreground/background. El valid original del monitor certifica
foreground y se conserva intacto; la evidencia del intervalo especifica la base
visible-stable-focus y oclusión unknown. SinJuego conserva foreground obligatorio.
Un intervalo mixto no es comparable; no confundir visible con píxeles descubiertos.
También se conservan instancias GPU por PID/adaptador/motor y memoria por dominio;
el campo agregado histórico gpuPct sigue siendo solo diagnóstico. La validación
Wails de este ajuste sigue pendiente. Continúa siendo exploración, sin ahorro.

Se conserva `scripts/bench/huella.ps1` y sus colectores. `A0 -SinJuego` recoge CPU,
memoria privada, working set y contadores GPU, pero permanece **no publicable**.
Su etiqueta histórica `ram-only-no-game` no se renombra ni se convierte en una
certificación de la base. Solo permite una primera exploración con Hub visible,
ruta verificada y HUD/Studio ausentes.

Cambios mínimos de tooling en esta entrega:

- `build-measurement.ps1 -FromEnvironment` usa configuración pública ya inyectada, establece los equivalentes frontend y restaura variables al acabar o fallar. Rechaza configuraciones frontend/backend diferentes y no sobrescribe un Go generado previo. Comprueba solo la existencia de archivos de entorno que Vite podría cargar y rechaza la compilación si existen; no los abre. No se invoca el modo de archivo en esta campaña. `-BuildChannel nightly` fija la identidad real de canal; el valor se normaliza a minúsculas y el defecto general sigue siendo master.
- Con `-SinJuego`, el banco ya no modifica PATH ni consulta/limpia sesiones ETW de PresentMon. Se conserva el comportamiento del protocolo con juego.
- Regresiones en `huella-lifecycle.test.mjs`; compilers sustituidos solo en el test de orquestación. Sus archivos temporales **no son builds reales ni muestras de rendimiento**.

La configuración necesaria para compilación estaba presente en el entorno al
preflight (solo se consultó presencia, nunca valores). La configuración embebida
no prueba una sesión autenticada: se mantiene el gate `license:changed` real.
La release production deshabilita CDP (`cmd/vantare/webview_debug_production.go:8`)
y no sustituye una build diagnóstica. La compilación optimizada del preflight real
ha pasado; identidad nightly explícita, sin tag production ni gcflags que desactiven inlining.

Ampliación mínima posterior a la primera exploración:

- `A0 -BaseRoute home|month|timeline` prepara una ruta real mediante UI; `-SinJuego` conserva el escenario alternativo sin simulador. El monitor existente añade `--surface hub`, por PID+título productivo `Vantare Hub`; conserva overlay por defecto y sus campos/reglas. Observa presencia, visibilidad, minimizado y foreground; **oclusión desconocida**, no certifica todos los píxeles descubiertos.
- El helper base observa cambios de ruta, visibilidad, tamaño, estado de overlays, interacciones y los eventos Auto sin rAF/tracing. Exige ruta/viewport iguales, cero HUD/Studio/bienvenida, nivel Auto estable, efectos completos y eventos sin silencios/huecos mayores de tres segundos (el productor emite a 1 Hz). Un cambio intermedio invalida aunque el estado vuelva al original. Registra solo clase y momento de la interacción, nunca su contenido; desmonta todos sus listeners al acabar.
- CSV conserva `baseRoute`, `baseNativeVisible`, `baseStateValid` y `baseLevels`, además de las evidencias completas de inicio/fin. Un fallo de la comprobación final base conserva crudos inválidos. No cambia la bandera histórica `publishable=false` ni permite agregarla como aceptación del protocolo HUD.
- LMU abierto bloquea únicamente el escenario explícito BaseRoute/SinJuego; el guard original se comprobó con LMU PID 29092. BaseRoute con juego exige el proceso vivo y conserva PID/CPU/RAM aparte. Nunca cierra el juego.

Gates que aún impiden aceptar una baseline completa:

- A0 sin BaseRoute no garantiza Inicio ni ausencia de Studio. La extensión base está probada estáticamente, pero falta validar en Wails visible/minimizado/cambio de foco y una corrida completa; el primer CSV no recibe retrospectivamente sus garantías.
- `gpuPct` actual suma motores por PID (`huella.ps1`, función Get-GpuTotals); no es un porcentaje único de GPU total. Registrar adaptador/motor y reportar cada dominio por separado antes de aceptar decisiones GPU. `WindowsHostSampler.Sample` no mide su campo GPUPct (`internal/app/performance/sensor/host_windows.go:93`); su cero no es evidencia.
- Los nuevos metadatos deben incorporarse al control de mezcla entre corridas antes de A/B; el resumen histórico sigue rechazando Forzar/SinJuego. No eliminar ni sortear `publishable=false` del protocolo viejo.
- Base minimizada requiere reapertura y cierre reales por bandeja: al destruir el último Hub no queda target CDP; el helper actual reabre desde un overlay. No abrir HUD como truco para medir esta campaña ni añadir un canal productivo alternativo.

Siguiente: validar la extensión base real, completar contadores GPU por dominio y
control de mezcla, y medir repetibilidad. Minimizado se valida aparte.

## Protocolo de medición y aceptación

1. Un único medidor y sin builds/tests propios durante el intervalo. LMU y Edge permanecen abiertos; registrar su contexto y cualquier interferencia de otra tarea. No cerrar procesos ajenos ni cambiar sus ventanas. `-Forzar` siempre invalida aceptación del protocolo histórico.
2. Un mismo ejecutable/dist por variante, hashes antes/después, SHA de producto y tooling por separado, estado Git y flags de compilación. No identificar un binario antiguo con el HEAD del checkout. Registrar máquina, Windows/WebView2, adaptador/driver, monitores, resolución, escala, frecuencia, energía y temperatura inicial disponible sin inventarla.
3. Conservar cuenta/licencia, calendario real, idioma, perfiles, tamaño de ventana, navegación previa, modo y nivel efectivo, animaciones y blur. Sin datos demo en la evidencia. Los datos de prueba de tooling se etiquetan aparte.
4. Separar arranque frío, primer uso, reposo estabilizado y sesión larga. Escenario principal: Inicio junto a LMU sin HUD/Studio; después Carreras. La primera exploración histórica fue sin juego y se conserva aparte. Para reposo: 60 s de estabilización y 180 s de captura, mismas duraciones entre variantes. Registrar cadencia y huecos reales del colector; no llamar 1 Hz a un intervalo que tarda más.
5. Calibrar A/A con tres pares de corridas iguales. Medir ruido absoluto además de CV; cerca de cero, CV por sí solo no decide. Fijar margen de equivalencia y mejora detectable después de A/A y antes de probar B. Si el banco no distingue señal de ruido, resultado inconcluso.
6. Perfilar separadamente para atribuir coste: Go CPU/asignaciones y WebView2 JS/layout/paint. No incluir tracing, React Profiler, rAF diagnóstico ni capturas dentro del intervalo de aceptación. Un contador rAF no certifica FPS presentados.
7. Abrir issue de un solo corte, crear/identificar regresión, editar, ejecutar checks del lenguaje y revisar diff. A/B con al menos tres pares alternando orden; comparar diferencias emparejadas y ruido A/A. Una mejora debe repetirse y superar el margen predeclarado; no elegir la corrida favorable.
8. Conservar solo si baja coste sin regresión material de los otros recursos, respuesta, calidad visual, datos y contratos. CPU menor a cambio de RAM mayor no es victoria automática. Si se necesita negociar un tradeoff real, decidirlo explícitamente con Isaac.
9. Registrar candidato, hipótesis, archivos, pruebas, hashes, CSV bruto, resultado por estado, decisión y motivo de descarte. Cinco experimentos consecutivos sin mejora o ocho horas acumuladas de ejecución cierran el bucle, sin reinicio automático. La preparación de esta issue no cuenta como experimento productivo iniciado.

| Magnitud | Qué se informa |
| --- | --- |
| CPU | Tiempo CPU y porcentaje normalizado a la máquina completa, árbol propio con roles y auxiliares. Media, p50/p95, picos y distribución por corrida. No mezclar porcentaje de un núcleo con el del equipo. |
| RAM | Memoria privada en MiB, pico y evolución; working set aparte. Sumar working sets puede contar páginas compartidas varias veces: no llamarlo RAM física exclusiva. Heap Go/JS solo como atribución. |
| GPU | Utilización por adaptador/motor, memoria dedicada y, cuando exista, compartida; ausencia como N/A. No sumar motores y presentar el resultado como porcentaje total. |
| Respuesta y visual | Inicio utilizable, navegación, tareas largas y reapertura; mismos textos, datos, efectos y estados. Verificar ventana Wails real. En estados con juego, impacto sobre frametime de LMU es una comprobación separada y coordinada. |

Matriz progresiva: Inicio, Carreras (cinco vistas), Launcher (abrir/volver), Ajustes
(general/diagnóstico/calendario), Engineer, Strategy, Roadmap/Testing y Analysis
con sesión real soportada. Después minimizar/restaurar, ciclos de navegación/cierre
y sesión prolongada para retención. Las rutas sin evidencia de composición o datos
reales quedan pendientes; una demo no rellena cobertura. Priorizar Inicio y el
escenario del candidato antes de ejecutar repetidamente toda la matriz.

## Evidencia y pendientes

- Base remota y aislamiento verificados; dos inventarios independientes en snapshots limpios y revisión del tooling. No se desarrolló en el checkout principal.
- Preparación inicial: dos regresiones fallan contra los scripts originales; 44/44 PASS. Ampliación base y correcciones de revisión: 51/51 PASS, incluidos rechazo de cambios intermedios y pérdida de eventos. La revisión detectó dos P2: Mes → Timeline → Mes podía quedar oculto al observar solo aria-current, y un HUD que abría y cerraba entre extremos podía pasar inadvertido. Dos regresiones con el observador real fallaron antes del arreglo y pasan después: observa los atributos de selección y overlay:status, además de invalidar interacciones. Los fixtures DOM/event-bus y la compilación simulada prueban tooling/cleanup, no Wails real. Revisión independiente de cierre ACCEPT estático sobre 3abe2b16: ambos P2 cerrados, sin nuevos P1/P2 en el diff.
- Revisión independiente de la preparación inicial ACCEPT. Extensión nativa entregada por worker en commit 116250cf y revisada por el padre antes de incorporar como 7758085d; solo dos archivos del monitor, sin cambios productivos. Parser PowerShell y diff-check PASS. Roadmap previo: 23/23 digest y 21/21 contrato PASS; estas pruebas no certifican runtime.
- Preflight Windows real PASS: frontend/Go compilados; runtime aprobado verificado y handshake smoke PASS; sesión activa Owner y deviceOK; Inicio sin bienvenida, sin Studio y sin widgets runtime, único target Hub. Cierre Application.Quit comprobado. Se completó la bienvenida en la configuración portable propia con rol intermedio, sin cambiar la instalación personal.
- Primera captura A0 y perfiles UI completados; pendientes validación del banco base, A/A y A/B. Hay CSV real de Inicio; no hay ahorro medido.
- Isaac declaró el PC disponible y cerró personalmente LMU y la otra Vantare; la tarea de widgets terminó su turno documental. Isaac exige conservar los cinco Edge sin ventana (PIDs observados 6576, 11032, 11928, 12236 y 17376). Se mantienen abiertos y se registran por separado mediante snapshots antes/después. Se reutiliza A0/SinJuego con Forzar exclusivamente para exploración, conservando hygieneForced=true y publishable=false. Los snapshots no permiten descontar interferencia ni certificar GPU; si el ruido impide distinguir una mejora, la comparación es inconclusa.
- CI de la base: [release build PASS](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34079151661); [branch-channel-gates FAIL](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34079141222) en `TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles` y `TestManifestOperationsHonorContextWithoutLateWriteOrTempLeak/checkpoint`. Frontend y build Wails posteriores quedaron sin ejecutar. No atribuir ese fallo al tooling ni declarar el conjunto verde.
- `go test ./...` PASS después de ampliar el monitor Go, incluyendo SQLite en esta ejecución; no borra el fallo histórico del CI de la base. Build del monitor PASS. No se ejecutó suite frontend completa porque no cambió código productivo frontend; sí typecheck/build optimizado y legible reales. Los cortes productivos necesitan los checks completos aplicables.
- El push de 29efba6c registra además [Testing Center agent fix FAIL](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34164832100), sin jobs ni check-runs, igual que los pushes anteriores. Coincide con la incidencia abierta [#728](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/728); no hay cambios en workflows en esta rama. El PASS de Branch channel gates se informa por su SHA/run y no convierte todos los workflows en verdes. La causa raíz de #728 no se diagnostica ni corrige en este alcance.

Artefactos locales del preflight (en results, sin versionar):

- `results/isa1015-preflight/manifest.json`: máquina Ryzen 7 3700X, 31,93 GiB RAM, RX 7800 XT + monitor virtual Meta; procedencia, flags y hashes, sin credenciales.
- `bin/vantare-isa1015-nightly.exe`: SHA-256 `53136de43fde4117aa96fa12512b865291ce19b0fe5bbe7c33b6fd586ea26943`.
- Dist embebido: SHA-256 de directorio `f1a69bb8594c1dd80765ed6939e3b27f0af2d6d773b16bfb5ad80f5bd581b290`.
- Runtime aprobado: manifest SHA-256 `700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`, cinco miembros; preparado mediante `prepare-runtime.ps1 -UsePublishedRuntime` y verificado en su ubicación final.
- `results/isa1015-preflight/home-preflight.json`, `license.json`, `performance.json` y `home.png`: prueba de estado y captura. Auto estaba en nivel efectivo 2, effects full, fuente unavailable por juego ausente. Son muestras diagnósticas fuera de aceptación; el campo GPU interno no es una medición.
- Exe/configs/data propios bajo bin y WebView propio bajo `results/isa1015-preflight/webview/vantare-isa1015-nightly.exe/EBWebView`. Auth y cachés auxiliares siguen sus rutas productivas compartidas; no se leyeron ni copiaron credenciales. Es una instalación portable preparada, no la configuración habitual del usuario.
- El primer ejecutable de diagnóstico que conservaba master no se utilizó para preflight ni medidas; se construyó después el candidato nightly identificado arriba. Los únicos cambios de fuente posteriores a d6d0992f son tooling/documentación, no código productivo.

### Primera exploración real: Inicio con Edge conservado

Captura `results/isa1015-base-home/run1/a0-20260907-231514.csv`, 60 s de
calentamiento y 180 s configurados. 720 filas de nueve procesos propios, 80 muestras
entre 23:16:29 y 23:19:27 CEST; separación media 2,252 s, p95 2,425 s, máxima
3,784 s. No es muestreo de 1 Hz. Exe/dist estables, licencia activa y cierre limpio.
Las medias siguientes promedian muestras, no ponderan por la duración variable de cada intervalo.

| Medida del árbol propio | Media de muestras |
| --- | ---: |
| CPU normalizada a los 16 procesadores lógicos | 0,1907 % |
| CPU del host Go | 0,0829 % |
| CPU del renderer Hub | 0,0549 % |
| Memoria privada | 342,69 MiB |
| Suma de working sets, puede duplicar páginas compartidas | 533,13 MiB |
| Memoria GPU dedicada según contador | 74,23 MiB |
| Suma de motores GPU, solo diagnóstico | 0,0836 |

Los 720 registros GPU tienen contador disponible; la suma no equivale a porcentaje
total de tarjeta. Sin adaptador/motor separado todavía. El proceso GPU concentra
134,01 MiB privados; eso no justifica desactivar aceleración ni reducir efectos.

Edge conservó los mismos cinco PID y acumuló 0,046875 s CPU durante los 263,141 s
del intervalo ampliado (arranque, calentamiento y cierre incluidos): aproximadamente
0,0011 % de CPU de máquina. Memoria privada Edge 103,41 → 103,35 MiB. Estos
snapshots son control de contexto, no una corrección del ruido ni prueba de ausencia
de actividad GPU. Evidencia sanitizada en `exploratory-summary.json`, `edge-before.json`
y `edge-after.json`, junto al CSV local.

Inicio/Owner/viewport 1264x761 DPR 1 y ausencia de HUD/Studio verificados antes de
la captura. Falta una comprobación de ruta/nivel al final y visibilidad nativa continua.
**Una corrida, hygieneForced=true y publishable=false: no es A/A, aceptación ni
ahorro.** No se ha iniciado ningún experimento productivo ni consumido/reiniciado
el límite de cinco experimentos sin mejora.

### Atribución separada, sin cambios de producto

- Go, 120 s: el perfil contiene 119,82 s de muestras y 117,66 s bajo `GetMessage`. Es inconcluso para priorizar CPU: no se midió el delta de CPU del host durante ese mismo intervalo. No interpretar espera muestreada como CPU consumida ni usar sus porcentajes como ahorro. Artefactos locales `results/isa1015-profile-home/host.pprof` y `host-top.txt`.
- El perfil JS optimizado fue rechazado por ilegibilidad; se conserva el crudo, sin sustituir el gate. Esa captura también incluyó una inspección/screenshot y se descarta para atribución. Se reutilizó `ReadableFrontend` en otra build, sin cambios de fuente ni dependencias. Las tres capturas siguientes terminaron con código cero, nombres legibles y retirada del probe.
- Build legible SHA-256 `01f1157ef8fc6365ff02a41d7e93a4e32332a4f43550dd8030f6f36c7ebe0156`; dist `28845cf241ee9ed8955834b6d2dfebda3b5d31a5220177b7cb5d35b5a8bc22d0`. El dist optimizado original se conservó y restauró con hash f1a69bb8; el exe de medida original sigue intacto. WebView diagnóstico separado, sin copiar credenciales/cachés.

| Perfil legible de 60 s | Tiempo de tareas | Tiempo de script | Layout | Tareas largas |
| --- | ---: | ---: | ---: | ---: |
| Inicio | 1,003 s | 0,138 s | 0,049 s | 0 |
| Carreras Mes | 1,141 s | 0,196 s | 0,082 s | 0 |
| Carreras Timeline | 1,404 s | 0,314 s | 0,087 s | 0 |

Estas métricas instrumentadas no son CPU de máquina ni FPS presentados. El helper
inyecta rAF diagnóstico (visible entre las primeras funciones): no atribuirlo al
producto. El calendario servido por backend tenía 11 series (3 beginner, 3
intermediate, 3 advanced, 2 weekly), 11 previews y cero eventos especiales; Mes
pintó 42 celdas y Timeline 11 filas/660 salidas. Esto acredita fuente backend y
composición real, no actualidad editorial del calendario. No se montó HUD/Studio.

Los perfiles localizan reconstrucción de elementos/props del Timeline y pequeños
recálculos, pero su coste absoluto no justifica todavía un corte: falta repetibilidad
y ahorro detectable. No se demuestra fuga por crecimiento puntual del heap.
Se observó Auto nivel 3 al preparar Inicio y 2 después; efectos full en ambos.
Por eso la nueva captura debe conservar las transiciones de nivel, no asumirlo fijo.
Se volvió a Inicio y se cerró limpiamente el diagnóstico propio.

### Pausa anterior, sustituida por la autorización de coexistencia

A las 23:40:05 CEST reapareció LMU PID 29092; las capturas y perfiles anteriores
ya habían terminado (último cierre diagnóstico 23:34:33). La tarea de widgets
estaba activa. Se pausó entonces el escenario sin juego y el guard rechazó
correctamente lanzar otra Vantare. Esa pausa ya no está vigente.
El 2026-09-08 Isaac autoriza continuar con LMU abierto. La validación Wails del
banco se completó después para coexistencia; A/A sigue pendiente.
No hay merge, promoción ni release.

### Tres repeticiones con LMU: referencia descriptiva

60 s de calentamiento y 180 s configurados por corrida, mismo exe/dist de nightly
d6d0992f. Tooling 4000b023 en run1 y a185b50f en run2/3; la diferencia únicamente
normaliza decimales del CSV contextual LMU. Crudo original conservado con lectura
es-ES explícita; los contadores propios no cambiaron.

| Corrida | Muestras propias | CPU media máquina | Memoria privada media | Motor 3D medio |
| --- | ---: | ---: | ---: | ---: |
| run1 / 001814 | 72 | 0,4907 % | 346,33 MiB | 0,06407 % |
| run2 / 002636 | 70 | 0,6322 % | 344,25 MiB | 0,06046 % |
| run3 / 003101 | 73 | 0,5718 % | 343,35 MiB | 0,06543 % |

Artefactos locales: `results/isa1015-base-live/run1..run3`, CSV originales,
`exploratory-summary.json` por corrida y `repeat-summary.json` conjunto.
215 instantes/1935 filas de nueve procesos; medias aritméticas, no ponderadas
por tiempo. Cadencia media 2,50/2,60/2,50 s. Dos intervalos GPU inválidos
(18 filas) excluidos: 213 muestras GPU válidas, sin rellenar con ceros.
Motor 3D: `luid_0x00000000_0x0000b897_phys_0_eng_0_engtype_3d`;
no equivale a porcentaje total de GPU ni identifica por sí solo su modelo.

Media de las tres medias: CPU 0,5649 %, memoria privada 344,64 MiB. CV muestral
entre corridas: CPU 12,57 %, RAM 0,44 %. El ruido CPU supera la guía del 5 %:
estas tres repeticiones no permiten aceptar ahorros pequeños ni sustituyen las
seis corridas del A/A formal. No compararlas con la captura histórica sin juego.
El proceso GPU concentra aproximadamente 134–138 MiB de RAM privada, Go 76 MiB,
renderer Hub 65 MiB y browser 37–38 MiB. RAM privada del proceso GPU no es VRAM;
su tamaño no demuestra fuga ni justifica desactivar aceleración.

Home 1264x761/DPR1, Hub visible/no minimizado, foco background estable, oclusión
desconocida, Auto3/full/raf40; fuente lmu/stale/available y sourceHz0 estables.
Esto no prueba conducción activa. El campo cars=0 del banco es un valor de CLI,
no un recuento observado; identidad de sesión/carrera no verificada. LMU mantuvo
su PID y consumió aproximadamente 29–30 % CPU de máquina, registrado aparte y
excluido de las cifras propias. Edge/Racelab permanecieron abiertos. No se resta
su interferencia. Las tres corridas validaron estado y terminaron con cierre
limpio, sin procesos propios residuales; todas conservan publishable=false.

Banco 60/60 tests PASS. Revisión estática ACCEPT hasta 4000b023 y revisión
parental de la regresión decimal de a185b50f. Smoke3 Wails positivo; smokes1/2
abortaron antes de medir por falta de foreground. La validación negativa nativa
de minimizar/cambiar foco durante captura sigue pendiente.

CI: b8ffeea5 falló por timeout frontend en la superficie excluida, separado en
[#1018](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1018).
a185b50f falló en el test Go de PTT ya registrado en
[#812](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/812);
la única repetición del run 34166748099 pasó Go y falló en
`overlay-frame-v2-performance.test.ts`: p99 1,532 ms frente al límite de 1,5 ms,
3235 tests PASS/1 FAIL. Hallazgo separado en #1019 y Project Vantare; es otra
superficie excluida, sin cambios en esta rama. Ampliación documental de rapidez:
roadmap regenerado, 23 tests de digest y 21 de contrato PASS; diff-check PASS.
#728 sigue aparte. No se modifican esos tests/workflows ni se repite CI a ciegas.
Siguiente paso: atribuir arranque y preparar criterios de navegación real antes
de elegir un corte productivo con issue propia. No hay ahorro ni promoción.

### Archivos de la entrega y comprobación pendiente

- Banco: `scripts/bench/build-measurement.ps1`, `huella.ps1`, `huella-cdp.mjs`, `huella-lifecycle.test.mjs` y `all.test.mjs`; nuevos `huella-base.mjs` y `huella-base.test.mjs`.
- Monitor: `tools/overlay-visibility-probe/main_windows.go` y `main_windows_test.go`.
- Documentación: este informe nuevo, `docs/vantare-program/handoffs/platform-commercial.md`, `docs/roadmap/plan.md` y su `roadmap.json` regenerado. Sin archivos productivos de la app modificados ni movimientos versionados.

Con LMU y Edge abiertos: el modo coexistencia admite Hub visible con foco
foreground o background estable; cambiar foco, minimizar, cambiar ruta o abrir
HUD debe invalidar el reposo. Recuperar el estado inicial no borra el fallo.
El recorrido de rapidez se mide aparte con interacción permitida y foco foreground;
no reutilizar la validación de reposo para aceptar navegación.
