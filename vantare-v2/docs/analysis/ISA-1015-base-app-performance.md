# ISA-1015 — rendimiento de la base de Vantare

Estado a 2026-09-07: inventario estático y preparación mínima del banco.
**No hay baseline real, ahorro demostrado ni optimización productiva.**
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

Se conserva `scripts/bench/huella.ps1` y sus colectores. `A0 -SinJuego` recoge CPU,
memoria privada, working set y contadores GPU, pero permanece **no publicable**.
Su etiqueta histórica `ram-only-no-game` no se renombra ni se convierte en una
certificación de la base. Solo permite una primera exploración con Hub visible,
ruta verificada y HUD/Studio ausentes.

Cambios mínimos de tooling en esta entrega:

- `build-measurement.ps1 -FromEnvironment` usa configuración pública ya inyectada, establece los equivalentes frontend y restaura variables al acabar o fallar. Rechaza configuraciones frontend/backend diferentes y no sobrescribe un Go generado previo. Comprueba solo la existencia de archivos de entorno que Vite podría cargar y rechaza la compilación si existen; no los abre. No se invoca el modo de archivo en esta campaña.
- Con `-SinJuego`, el banco ya no modifica PATH ni consulta/limpia sesiones ETW de PresentMon. Se conserva el comportamiento del protocolo con juego.
- Regresiones en `huella-lifecycle.test.mjs`; compilers sustituidos solo en el test de orquestación. Sus archivos temporales **no son builds reales ni muestras de rendimiento**.

La configuración necesaria para compilación estaba presente en el entorno al
preflight (solo se consultó presencia, nunca valores). La configuración embebida
no prueba una sesión autenticada: se mantiene el gate `license:changed` real.
La release production deshabilita CDP (`cmd/vantare/webview_debug_production.go:8`)
y no sustituye una build diagnóstica. No se ha construido todavía ninguna.

Gates que aún impiden aceptar una baseline completa:

- A0 no garantiza Inicio ni ausencia de Studio: CDP debe verificar ruta/estado reales antes y después. DOM presente no prueba ventana visible durante todo el intervalo.
- El monitor nativo actual valida HUD+juego, no Hub. Extender su modo para Hub visible conservando la ruta overlay existente, si la exploración confirma utilidad.
- `gpuPct` actual suma motores por PID (`huella.ps1`, función Get-GpuTotals); no es un porcentaje único de GPU total. Registrar adaptador/motor y reportar cada dominio por separado antes de aceptar decisiones GPU. `WindowsHostSampler.Sample` no mide su campo GPUPct (`internal/app/performance/sensor/host_windows.go:93`); su cero no es evidencia.
- El resumen no impide todas las mezclas de ruta/nivel/estado. Añadir esos metadatos y rechazo antes de A/B publicable. No eliminar ni sortear `publishable=false` del protocolo viejo.
- Base minimizada requiere reapertura y cierre reales por bandeja: al destruir el último Hub no queda target CDP; el helper actual reabre desde un overlay. No abrir HUD como truco para medir esta campaña ni añadir un canal productivo alternativo.

La siguiente adaptación será una condición base explícita dentro del mismo banco,
navegación permitida, visibilidad nativa y metadatos/contadores correctos; minimizado
se valida aparte. No se declara implementada por haber preparado los scripts.

## Protocolo de medición y aceptación

1. Reservar PC y un único medidor. Sin builds, tests, otros bancos ni cambios de ventana durante el intervalo. No cerrar procesos ajenos, LMU u OBS. `-Forzar` siempre invalida aceptación.
2. Un mismo ejecutable/dist por variante, hashes antes/después, SHA de producto y tooling por separado, estado Git y flags de compilación. No identificar un binario antiguo con el HEAD del checkout. Registrar máquina, Windows/WebView2, adaptador/driver, monitores, resolución, escala, frecuencia, energía y temperatura inicial disponible sin inventarla.
3. Conservar cuenta/licencia, calendario real, idioma, perfiles, tamaño de ventana, navegación previa, modo y nivel efectivo, animaciones y blur. Sin datos demo en la evidencia. Los datos de prueba de tooling se etiquetan aparte.
4. Separar arranque frío, primer uso, reposo estabilizado y sesión larga. Primera exploración: Inicio sin juego/HUD/Studio; después Carreras. Para reposo: 60 s de estabilización y 180 s de captura, mismas duraciones entre variantes. Registrar cadencia y huecos reales del colector; no llamar 1 Hz a un intervalo que tarda más.
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
- Dos nuevas regresiones fallan contra los scripts originales de la base. Suite del banco modificada: **44/44 PASS**. Prueba de compilación simulada valida orquestación/cleanup, no Wails real.
- Revisión estática independiente del tooling: **ACCEPT**, sin hallazgos bloqueantes. Parser PowerShell y comprobación de espacios PASS. Roadmap: 23/23 tests del digest y 21/21 del contrato PASS; artefacto regenerado desde origin/nightly y comprobado sin diferencias pendientes. Estas pruebas no certifican el runtime.
- Pendientes: build diagnóstica real, autenticación, exploración A0, extensión/validación del banco base, baseline A/A, perfiles y A/B. Sin cifras actuales de CPU/GPU/RAM.
- Al preparar esta entrega hay otras tareas activas y un proceso LMU vivo. Se conservan; no se ha lanzado banco, app, juego ni build real.
- CI de la base: [release build PASS](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34079151661); [branch-channel-gates FAIL](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34079141222) en `TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles` y `TestManifestOperationsHonorContextWithoutLateWriteOrTempLeak/checkpoint`. Frontend y build Wails posteriores quedaron sin ejecutar. No atribuir ese fallo al tooling ni declarar el conjunto verde.
- No se ejecutan tests Go/frontend ni build de app por esta modificación exclusiva de tooling/documentación. Los futuros cortes productivos sí necesitan los checks completos aplicables.

Verificación siguiente con PC disponible: desde el worktree, ejecutar
`pwsh -NoProfile -File scripts/bench/build-measurement.ps1 -FromEnvironment`,
registrar procedencia/hashes y validar licencia real. Preparar A0/SinJuego solo
como exploración; verificar Inicio y ausencia de HUD/Studio, visibilidad y cierre
antes de capturar. No ejecutar este paso mientras LMU u otro banco estén usando el PC.
